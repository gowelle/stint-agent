import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { authService } from '../services/auth.js';
import { apiService } from '../services/api.js';
import { logger } from '../utils/logger.js';

export function registerLogoutCommand(program: Command): void {
    program
        .command('logout')
        .description('Log out and remove stored credentials')
        .action(async () => {
            const spinner = ora('Logging out...').start();

            try {
                // Check if we're logged in
                const token = await authService.getToken();
                if (!token) {
                    spinner.info('Not currently logged in');
                    return;
                }

                // Try to disconnect the session
                try {
                    await apiService.disconnect();
                } catch (error) {
                    // Ignore errors during disconnect, we'll clear the token anyway
                    logger.warn('logout', 'Failed to disconnect session, continuing with logout');
                }

                // Clear the stored token
                await authService.clearToken();

                spinner.succeed('Logged out successfully');
                console.log(chalk.gray('\nYour credentials have been removed from this machine.\n'));

                logger.success('logout', 'User logged out');
            } catch (error) {
                spinner.fail('Logout failed');
                logger.error('logout', 'Logout failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}`));
                process.exit(1);
            }
        });
}
