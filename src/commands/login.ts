import { Command } from 'commander';
import open from 'open';
import ora from 'ora';
import chalk from 'chalk';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { URL } from 'url';
import { authService } from '../services/auth.js';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';

interface CallbackResult {
    server: Server;
    port: number;
    promise: Promise<string>;
}

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param text Text to escape
 * @returns Escaped text safe for HTML embedding
 */
function escapeHtml(text: string | null): string {
    if (!text) {
        return '';
    }
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Start a local HTTP server to receive OAuth callback
 * @param expectedState The state parameter to validate against
 * @param timeoutMs Timeout in milliseconds (default: 5 minutes)
 * @returns Object containing server, port, and promise that resolves with token
 */
function startCallbackServer(expectedState: string, timeoutMs = 5 * 60 * 1000): Promise<CallbackResult> {
    return new Promise((resolve, reject) => {
        const server = createServer();
        let callbackResolve: (token: string) => void;
        let callbackReject: (error: Error) => void;
        let timeout: NodeJS.Timeout;

        const callbackPromise = new Promise<string>((resolve, reject) => {
            callbackResolve = resolve;
            callbackReject = reject;
        });

        server.on('request', (req, res) => {
            if (req.url?.startsWith('/auth/callback')) {
                try {
                    const url = new URL(req.url, `http://${req.headers.host}`);
                    const token = url.searchParams.get('token');
                    const state = url.searchParams.get('state');
                    const error = url.searchParams.get('error');

                    // Handle error from OAuth provider
                    if (error) {
                        const errorDescription = url.searchParams.get('error_description') || error;
                        const escapedError = escapeHtml(errorDescription);
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end(`
                            <html>
                                <head><title>Authentication Failed</title></head>
                                <body>
                                    <h1>Authentication Failed</h1>
                                    <p>${escapedError}</p>
                                    <p>You can close this window.</p>
                                </body>
                            </html>
                        `);
                        callbackReject(new Error(`OAuth error: ${errorDescription}`));
                        return;
                    }

                    // Validate state
                    if (state !== expectedState) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end(`
                            <html>
                                <head><title>Authentication Failed</title></head>
                                <body>
                                    <h1>Authentication Failed</h1>
                                    <p>Invalid state parameter. Security validation failed.</p>
                                    <p>You can close this window.</p>
                                </body>
                            </html>
                        `);
                        callbackReject(new Error('State parameter mismatch'));
                        return;
                    }

                    // Validate token
                    if (!token) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end(`
                            <html>
                                <head><title>Authentication Failed</title></head>
                                <body>
                                    <h1>Authentication Failed</h1>
                                    <p>No token provided in callback.</p>
                                    <p>You can close this window.</p>
                                </body>
                            </html>
                        `);
                        callbackReject(new Error('No token in callback'));
                        return;
                    }

                    // Success response
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                            <head><title>Authentication Successful</title></head>
                            <body>
                                <h1>Authentication Successful!</h1>
                                <p>You have been successfully authenticated. You can close this window.</p>
                            </body>
                        </html>
                    `);

                    // Resolve with token
                    callbackResolve(token);
                } catch (error) {
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                            <head><title>Error</title></head>
                            <body>
                                <h1>Error</h1>
                                <p>An error occurred processing the callback.</p>
                                <p>You can close this window.</p>
                            </body>
                        </html>
                    `);
                    callbackReject(error as Error);
                }
            } else {
                // Handle other routes
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            }
        });

        server.on('error', (error: NodeJS.ErrnoException) => {
            if (error.code === 'EADDRINUSE') {
                reject(new Error('Port is already in use'));
            } else {
                reject(error);
            }
        });

        // Find available port
        server.listen(0, '127.0.0.1', () => {
            const address = server.address() as AddressInfo;
            const port = address.port;

            // Set timeout
            timeout = setTimeout(() => {
                server.close();
                callbackReject(new Error('Authentication timeout: No callback received within 5 minutes'));
            }, timeoutMs);

            // Clear timeout when promise resolves/rejects
            callbackPromise
                .then(() => clearTimeout(timeout))
                .catch(() => clearTimeout(timeout))
                .finally(() => {
                    // Close server after a short delay to allow response to be sent
                    setTimeout(() => {
                        server.close();
                    }, 100);
                });

            resolve({
                server,
                port,
                promise: callbackPromise,
            });
        });
    });
}

export function registerLoginCommand(program: Command): void {
    program
        .command('login')
        .description('Authenticate with Stint')
        .action(async () => {
            const spinner = ora('Starting authentication server...').start();

            try {
                // Generate a unique state for OAuth
                const state = Math.random().toString(36).substring(7);
                const machineId = authService.getMachineId();
                const machineName = authService.getMachineName();

                // Start callback server
                spinner.text = 'Starting callback server...';
                const { port, promise: callbackPromise } = await startCallbackServer(state);

                // Build OAuth URL with redirect_uri
                const authUrl = new URL(`${config.getApiUrl()}/auth/agent`);
                authUrl.searchParams.set('state', state);
                authUrl.searchParams.set('machine_id', machineId);
                authUrl.searchParams.set('machine_name', machineName);
                authUrl.searchParams.set('redirect_uri', `http://localhost:${port}/auth/callback`);

                spinner.text = 'Opening browser for authentication...';
                await open(authUrl.toString());

                spinner.text = 'Waiting for authentication...';
                logger.info('login', `Login initiated, callback server listening on port ${port}`);

                // Wait for callback
                const token = await callbackPromise;

                spinner.text = 'Completing authentication...';
                await completeLogin(token);

                // Stop the spinner after successful authentication
                spinner.stop();

            } catch (error) {
                spinner.fail('Authentication failed');
                logger.error('login', 'Login failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}`));
                process.exit(1);
            }
        });
}

// Helper function to complete login (will be called by OAuth callback server)
export async function completeLogin(token: string): Promise<void> {
    const spinner = ora('Saving authentication token...').start();

    try {
        await authService.saveToken(token);

        spinner.text = 'Validating token...';
        const user = await authService.validateToken();

        if (!user) {
            throw new Error('Token validation failed');
        }

        spinner.succeed('Authentication successful!');
        console.log(chalk.green(`\n✓ Logged in as ${chalk.bold(user.email)}`));
        console.log(chalk.gray(`Machine: ${authService.getMachineName()} (${authService.getMachineId()})\n`));

        logger.success('login', `Logged in as ${user.email}`);
    } catch (error) {
        spinner.fail('Authentication failed');
        throw error;
    }
}
