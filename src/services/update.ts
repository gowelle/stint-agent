import { execSync } from 'child_process';
import { logger } from '../utils/logger.js';
import { validatePidFile, killProcess, isProcessRunning } from '../utils/process.js';
import ora from 'ora';
import chalk from 'chalk';

interface UpdateResult {
    success: boolean;
    error?: string;
    previousVersion?: string;
    newVersion?: string;
}

/**
 * Update service for managing CLI updates
 */
class UpdateService {
    /**
     * Perform update to latest version
     * @param channel - Release channel to update to (stable or beta)
     * @returns Update result
     */
    async performUpdate(channel: 'stable' | 'beta' = 'stable'): Promise<UpdateResult> {
        const spinner = ora('Preparing update...').start();

        try {
            // Check if daemon is running
            const { valid, pid } = validatePidFile();
            const daemonWasRunning = valid && pid !== null;

            if (daemonWasRunning) {
                spinner.text = 'Stopping daemon...';
                await this.stopDaemonForUpdate(pid!);
            }

            // Perform npm install
            spinner.text = `Installing latest ${channel} version...`;
            const packageSpec = channel === 'beta'
                ? '@gowelle/stint-agent@beta'
                : '@gowelle/stint-agent@latest';

            try {
                execSync(`npm install -g ${packageSpec}`, {
                    stdio: 'pipe',
                    encoding: 'utf8',
                });
            } catch (error) {
                // Check if it's a permission error
                const errorMessage = (error as Error).message;
                if (errorMessage.includes('EACCES') || errorMessage.includes('EPERM')) {
                    spinner.fail('Permission denied');
                    throw new Error(
                        'Permission denied. Try running with elevated privileges:\n' +
                        (process.platform === 'win32'
                            ? '  Run PowerShell as Administrator'
                            : '  sudo npm install -g @gowelle/stint-agent')
                    );
                }
                throw error;
            }

            // Restart daemon if it was running
            if (daemonWasRunning) {
                spinner.text = 'Restarting daemon...';
                await this.restartDaemonAfterUpdate();
            }

            spinner.succeed('Update completed successfully!');
            return { success: true };
        } catch (error) {
            spinner.fail('Update failed');
            logger.error('update', 'Update failed', error as Error);
            return {
                success: false,
                error: (error as Error).message,
            };
        }
    }

    /**
     * Stop daemon before update
     * @param pid - Process ID of daemon
     */
    private async stopDaemonForUpdate(pid: number): Promise<void> {
        try {
            // Send SIGTERM for graceful shutdown
            killProcess(pid, 'SIGTERM');

            // Wait for process to exit
            let attempts = 0;
            const maxAttempts = 10;

            while (attempts < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                if (!isProcessRunning(pid)) {
                    logger.info('update', 'Daemon stopped successfully');
                    return;
                }
                attempts++;
            }

            // Force kill if still running
            if (isProcessRunning(pid)) {
                logger.warn('update', 'Daemon did not stop gracefully, forcing shutdown');
                killProcess(pid, 'SIGKILL');
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        } catch (error) {
            logger.error('update', 'Failed to stop daemon', error as Error);
            throw new Error('Failed to stop daemon before update');
        }
    }

    /**
     * Restart daemon after update
     */
    private async restartDaemonAfterUpdate(): Promise<void> {
        try {
            // Use the newly installed stint binary to start daemon
            execSync('stint daemon start', {
                stdio: 'pipe',
                encoding: 'utf8',
            });

            logger.info('update', 'Daemon restarted successfully');
        } catch (error) {
            logger.error('update', 'Failed to restart daemon', error as Error);
            console.log(chalk.yellow('\n⚠ Failed to restart daemon automatically.'));
            console.log(chalk.gray('Run "stint daemon start" to start it manually.\n'));
        }
    }
}

// Export singleton instance
export const updateService = new UpdateService();
