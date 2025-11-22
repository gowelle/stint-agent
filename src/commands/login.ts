import { Command } from 'commander';
import open from 'open';
import ora from 'ora';
import chalk from 'chalk';
import { authService } from '../services/auth.js';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';

export function registerLoginCommand(program: Command): void {
    program
        .command('login')
        .description('Authenticate with Stint')
        .action(async () => {
            const spinner = ora('Opening browser for authentication...').start();

            try {
                // Generate a unique state for OAuth
                const state = Math.random().toString(36).substring(7);
                const machineId = authService.getMachineId();
                const machineName = authService.getMachineName();

                // Build OAuth URL
                const authUrl = new URL(`${config.getApiUrl()}/auth/agent`);
                authUrl.searchParams.set('state', state);
                authUrl.searchParams.set('machine_id', machineId);
                authUrl.searchParams.set('machine_name', machineName);

                spinner.text = 'Opening browser...';
                await open(authUrl.toString());

                spinner.text = 'Waiting for authentication...';

                // In a real implementation, we would:
                // 1. Start a local HTTP server to receive the OAuth callback
                // 2. Wait for the callback with the token
                // 3. Save the token

                // For now, we'll provide instructions to the user
                spinner.stop();

                console.log(chalk.blue('\n📋 Authentication Instructions:'));
                console.log(chalk.gray('1. Complete the authentication in your browser'));
                console.log(chalk.gray('2. Copy the token provided'));
                console.log(chalk.gray('3. Paste it below\n'));

                // In a production version, this would be handled by the OAuth callback
                // For now, we'll simulate it
                console.log(chalk.yellow('⚠ Note: Full OAuth flow will be implemented in production'));
                console.log(chalk.gray('For now, please obtain a token from the Stint web app\n'));

                logger.info('login', 'Login initiated');

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
