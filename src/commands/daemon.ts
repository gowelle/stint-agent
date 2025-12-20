import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
    validatePidFile,
    killProcess,
    spawnDetached,
    isProcessRunning,
    getPidFilePath,
} from '../utils/process.js';
import { authService } from '../services/auth.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function registerDaemonCommands(program: Command): void {
    const daemon = program.command('daemon').description('Manage the Stint daemon');

    // stint daemon start
    daemon
        .command('start')
        .description('Start the daemon in the background')
        .action(async () => {
            const spinner = ora('Starting daemon...').start();

            try {
                // Check if already running
                const { valid, pid } = validatePidFile();
                if (valid && pid) {
                    spinner.info('Daemon already running');
                    console.log(chalk.yellow(`\n⚠ Daemon is already running (PID: ${pid})\n`));
                    return;
                }

                // Validate authentication
                spinner.text = 'Validating authentication...';
                const user = await authService.validateToken();
                if (!user) {
                    spinner.fail('Not authenticated');
                    console.log(chalk.red('\n✖ You must be logged in to start the daemon.'));
                    console.log(chalk.gray('Run "stint login" first.\n'));
                    process.exit(1);
                }

                // Find the daemon runner script
                // After tsup bundling, __dirname is dist/, runner is at dist/daemon/runner.js
                const runnerPath = path.join(__dirname, 'daemon', 'runner.js');

                if (!fs.existsSync(runnerPath)) {
                    throw new Error(`Daemon runner not found at ${runnerPath}`);
                }

                // Spawn detached daemon process
                spinner.text = 'Spawning daemon process...';
                const daemonPid = spawnDetached('node', [runnerPath]);

                // Wait a moment to ensure daemon started
                await new Promise((resolve) => setTimeout(resolve, 1000));

                // Verify daemon is running
                if (!isProcessRunning(daemonPid)) {
                    throw new Error('Daemon failed to start');
                }

                spinner.succeed('Daemon started successfully!');
                console.log(chalk.green(`\n✓ Daemon is running in the background`));
                console.log(chalk.gray(`PID: ${daemonPid}`));
                console.log(chalk.gray(`Logs: ${path.join(os.homedir(), '.config', 'stint', 'logs', 'daemon.log')}\n`));

                logger.success('daemon', `Daemon started with PID ${daemonPid}`);
            } catch (error) {
                spinner.fail('Failed to start daemon');
                logger.error('daemon', 'Start command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });

    // stint daemon stop
    daemon
        .command('stop')
        .description('Stop the running daemon')
        .action(async () => {
            const spinner = ora('Stopping daemon...').start();

            try {
                const { valid, pid } = validatePidFile();

                if (!valid || !pid) {
                    spinner.info('Daemon not running');
                    console.log(chalk.yellow('\n⚠ Daemon is not running.\n'));
                    return;
                }

                // Send SIGTERM for graceful shutdown
                spinner.text = `Sending shutdown signal to process ${pid}...`;
                killProcess(pid, 'SIGTERM');

                // Wait for process to exit
                spinner.text = 'Waiting for daemon to shutdown...';
                let attempts = 0;
                const maxAttempts = 10;

                while (attempts < maxAttempts) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    if (!isProcessRunning(pid)) {
                        break;
                    }
                    attempts++;
                }

                if (isProcessRunning(pid)) {
                    spinner.warn('Daemon did not stop gracefully, forcing shutdown...');
                    killProcess(pid, 'SIGKILL');
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }

                spinner.succeed('Daemon stopped successfully');
                console.log(chalk.gray('\nDaemon has been stopped.\n'));

                logger.success('daemon', 'Daemon stopped');
            } catch (error) {
                spinner.fail('Failed to stop daemon');
                logger.error('daemon', 'Stop command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });

    // stint daemon status
    daemon
        .command('status')
        .description('Check if the daemon is running')
        .action(async () => {
            const spinner = ora('Checking daemon status...').start();

            try {
                const { valid, pid } = validatePidFile();

                spinner.stop();

                console.log(chalk.blue('\n⚙️  Daemon Status:'));
                console.log(chalk.gray('─'.repeat(50)));

                if (valid && pid) {
                    console.log(`${chalk.bold('Status:')}      ${chalk.green('✓ Running')}`);
                    console.log(`${chalk.bold('PID:')}         ${pid}`);
                    console.log(`${chalk.bold('PID File:')}    ${getPidFilePath()}`);
                    console.log(`${chalk.bold('Logs:')}        ${path.join(os.homedir(), '.config', 'stint', 'logs', 'daemon.log')}`);
                } else {
                    console.log(`${chalk.bold('Status:')}      ${chalk.yellow('Not running')}`);
                    console.log(chalk.gray('Run "stint daemon start" to start the daemon.'));
                }

                console.log();

                logger.info('daemon', `Status check: ${valid ? 'running' : 'not running'}`);
            } catch (error) {
                spinner.fail('Failed to check status');
                logger.error('daemon', 'Status command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });

    // stint daemon logs
    daemon
        .command('logs')
        .description('Tail daemon logs')
        .option('-n, --lines <number>', 'Number of lines to show', '50')
        .action(async (options) => {
            try {
                const logFile = path.join(os.homedir(), '.config', 'stint', 'logs', 'daemon.log');

                if (!fs.existsSync(logFile)) {
                    console.log(chalk.yellow('\n⚠ No daemon logs found.'));
                    console.log(chalk.gray('The daemon has not been started yet.\n'));
                    return;
                }

                const lines = parseInt(options.lines, 10);
                const content = fs.readFileSync(logFile, 'utf8');
                const logLines = content.split('\n').filter((line: string) => line.trim());
                const lastLines = logLines.slice(-lines);

                console.log(chalk.blue(`\n📋 Last ${lastLines.length} lines of daemon logs:\n`));
                console.log(chalk.gray('─'.repeat(80)));
                lastLines.forEach((line: string) => console.log(line));
                console.log(chalk.gray('─'.repeat(80)));
                console.log(chalk.gray(`\nLog file: ${logFile}`));
                console.log(chalk.gray('Use "tail -f" to follow logs in real-time.\n'));

                logger.info('daemon', 'Logs command executed');
            } catch (error) {
                logger.error('daemon', 'Logs command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });

    // stint daemon restart
    daemon
        .command('restart')
        .description('Restart the daemon')
        .action(async () => {
            console.log(chalk.blue('🔄 Restarting daemon...\n'));

            // Stop if running
            const { valid, pid } = validatePidFile();
            if (valid && pid) {
                const stopSpinner = ora('Stopping daemon...').start();
                try {
                    killProcess(pid, 'SIGTERM');

                    let attempts = 0;
                    while (attempts < 10 && isProcessRunning(pid)) {
                        await new Promise((resolve) => setTimeout(resolve, 500));
                        attempts++;
                    }

                    if (isProcessRunning(pid)) {
                        killProcess(pid, 'SIGKILL');
                    }

                    stopSpinner.succeed('Daemon stopped');
                } catch (error) {
                    stopSpinner.fail('Failed to stop daemon');
                    throw error;
                }
            }

            // Wait a moment before restarting
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Start daemon (reuse start logic)
            const startSpinner = ora('Starting daemon...').start();
            try {
                const user = await authService.validateToken();
                if (!user) {
                    throw new Error('Not authenticated');
                }

                const runnerPath = path.join(__dirname, 'daemon', 'runner.js');
                const daemonPid = spawnDetached('node', [runnerPath]);

                await new Promise((resolve) => setTimeout(resolve, 1000));

                if (!isProcessRunning(daemonPid)) {
                    throw new Error('Daemon failed to start');
                }

                startSpinner.succeed('Daemon started');
                console.log(chalk.green(`\n✓ Daemon restarted successfully (PID: ${daemonPid})\n`));
                logger.success('daemon', `Daemon restarted with PID ${daemonPid}`);
            } catch (error) {
                startSpinner.fail('Failed to start daemon');
                throw error;
            }
        });
}
