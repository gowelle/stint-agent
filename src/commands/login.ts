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
            // Set CORS headers for all responses
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-XSRF-TOKEN, X-Requested-With, X-Inertia, X-Inertia-Version');
            res.setHeader('Access-Control-Expose-Headers', 'X-Inertia-Location');
            res.setHeader('Access-Control-Allow-Private-Network', 'true');

            // Handle preflight requests
            if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Private-Network', 'true');
                res.writeHead(200);
                res.end();
                return;
            }

            if (req.url?.startsWith('/auth/callback')) {
                try {
                    const url = new URL(req.url, `http://${req.headers.host}`);
                    const token = url.searchParams.get('token');
                    const state = url.searchParams.get('state');
                    const error = url.searchParams.get('error');
                    const next = url.searchParams.get('next');

                    // Check if client expects JSON (fetch/XHR) or HTML (browser)
                    const accept = req.headers.accept || '';
                    const isInertia = req.headers['x-inertia'] === 'true';
                    const isJsonRequest = accept.includes('application/json') || isInertia;

                    // Handle error from OAuth provider
                    if (error) {
                        const errorDescription = url.searchParams.get('error_description') || error;

                        if (isJsonRequest) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                status: 'error',
                                error: error,
                                message: errorDescription
                            }));
                        } else {
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
                        }
                        callbackReject(new Error(`OAuth error: ${errorDescription}`));
                        return;
                    }

                    // Validate state
                    if (state !== expectedState) {
                        if (isJsonRequest) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                status: 'error',
                                error: 'invalid_state',
                                message: 'State parameter mismatch'
                            }));
                        } else {
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
                        }
                        callbackReject(new Error('State parameter mismatch'));
                        return;
                    }

                    // Validate token
                    if (!token) {
                        if (isJsonRequest) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                status: 'error',
                                error: 'missing_token',
                                message: 'No token provided'
                            }));
                        } else {
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
                        }
                        callbackReject(new Error('No token in callback'));
                        return;
                    }

                    // Success response
                    if (isInertia && next) {
                        // Force Inertia to do a hard redirect (top-level navigation)
                        // This avoids CORS issues with XHR redirects
                        res.writeHead(409, { 'X-Inertia-Location': next });
                        res.end();
                    } else if (isJsonRequest) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'success',
                            message: 'Authentication successful',
                            user: 'Authenticated',
                            next: next || undefined
                        }));
                    } else if (next) {
                        // Redirect if 'next' parameter is present
                        res.writeHead(302, { 'Location': next });
                        res.end();
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(`
                        <!DOCTYPE html>
                        <html>
                            <head>
                                <title>Stint - Authentication Successful</title>
                                <style>
                                    body {
                                        background-color: #0f172a;
                                        color: #e2e8f0;
                                        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                        height: 100vh;
                                        margin: 0;
                                    }
                                    .container {
                                        background-color: #1e293b;
                                        padding: 2.5rem;
                                        border-radius: 1rem;
                                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                                        text-align: center;
                                        max-width: 28rem;
                                        width: 100%;
                                        border: 1px solid #334155;
                                    }
                                    h1 {
                                        color: #38bdf8;
                                        margin-top: 0;
                                        font-size: 1.5rem;
                                        margin-bottom: 1rem;
                                    }
                                    p {
                                        color: #94a3b8;
                                        line-height: 1.5;
                                        margin-bottom: 1.5rem;
                                    }
                                    .icon {
                                        color: #22c55e;
                                        width: 3rem;
                                        height: 3rem;
                                        margin-bottom: 1.5rem;
                                    }
                                    .btn {
                                        background-color: #38bdf8;
                                        color: #0f172a;
                                        padding: 0.75rem 1.5rem;
                                        border-radius: 0.5rem;
                                        text-decoration: none;
                                        font-weight: 600;
                                        display: inline-block;
                                        transition: background-color 0.2s;
                                        border: none;
                                        cursor: pointer;
                                    }
                                    .btn:hover {
                                        background-color: #0ea5e9;
                                    }
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <h1>Authentication Successful</h1>
                                    <p>You have successfully logged in to Stint. You can now close this window and return to your terminal.</p>
                                    <button onclick="window.close()" class="btn">Close Window</button>
                                </div>
                                <script>
                                    // Attempt to close the window automatically after 3 seconds
                                    setTimeout(function() {
                                        window.close();
                                    }, 3000);
                                </script>
                            </body>
                        </html>
                        `);
                    }

                    // Resolve with token
                    callbackResolve(token);
                } catch (error) {
                    // Send error response based on request type
                    const isJsonRequest = req.headers.accept?.includes('application/json');

                    if (isJsonRequest) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'error',
                            message: 'Internal server error processing callback'
                        }));
                    } else {
                        res.writeHead(500, { 'Content-Type': 'text/html' });
                        res.end(`
                            <!DOCTYPE html>
                            <html>
                                <head>
                                    <title>Stint - Error</title>
                                    <style>
                                        body {
                                            background-color: #0f172a;
                                            color: #e2e8f0;
                                            font-family: sans-serif;
                                            display: flex;
                                            justify-content: center;
                                            align-items: center;
                                            height: 100vh;
                                            margin: 0;
                                        }
                                        .container {
                                            background-color: #1e293b;
                                            padding: 2rem;
                                            border-radius: 0.5rem;
                                            text-align: center;
                                            max-width: 24rem;
                                            border: 1px solid #334155;
                                        }
                                        h1 { color: #f43f5e; margin-top: 0; }
                                        p { color: #94a3b8; }
                                    </style>
                                </head>
                                <body>
                                    <div class="container">
                                        <h1>Authentication Error</h1>
                                        <p>An error occurred processing the callback.</p>
                                        <p>Please try logging in again.</p>
                                    </div>
                                </body>
                            </html>
                        `);
                    }
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

        // Find available port - bind to localhost to handle system IPv4/IPv6 preference
        server.listen(0, 'localhost', () => {
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
                    }, 500); // Increased delay slightly to ensure response flushes
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
