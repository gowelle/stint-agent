import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createInterface } from 'readline';
import {
    validatePidFile,
    killProcess,
    spawnDetached,
    isProcessRunning,
    getPidFilePath,
} from '../utils/process.js';
import { getProcessStats } from '../utils/monitor.js';
import { authService } from '../services/auth.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface LogFilter {
    level?: string;
    category?: string;
    since?: Date;
    until?: Date;
    search?: string;
}

function parseLogLine(line: string): { timestamp: Date; level: string; category: string; message: string } | null {
    const match = line.match(/\[(.*?)\] (\w+)\s+\[(.*?)\] (.*)/);
    if (!match) return null;

    const [, timestamp, level, category, message] = match;
    return {
        timestamp: new Date(timestamp),
        level,
        category,
        message
    };
}

function shouldIncludeLine(parsed: ReturnType<typeof parseLogLine>, filter: LogFilter): boolean {
    if (!parsed) return false;

    if (filter.level && filter.level.toUpperCase() !== parsed.level) {
        return false;
    }

    if (filter.category && !parsed.category.toLowerCase().includes(filter.category.toLowerCase())) {
        return false;
    }

    if (filter.since && parsed.timestamp < filter.since) {
        return false;
    }

    if (filter.until && parsed.timestamp > filter.until) {
        return false;
    }

    if (filter.search && !parsed.message.toLowerCase().includes(filter.search.toLowerCase())) {
        return false;
    }

    return true;
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
}

function colorizeLevel(level: string): string {
    switch (level.trim()) {
        case 'ERROR': return chalk.red(level);
        case 'WARN': return chalk.yellow(level);
        case 'INFO': return chalk.blue(level);
        case 'DEBUG': return chalk.gray(level);
        default: return level;
    }
}

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

                    // Get resource usage
                    const stats = await getProcessStats(pid);
                    if (stats) {
                        console.log(chalk.blue('\n📊 Resource Usage:'));
                        console.log(chalk.gray('─'.repeat(50)));
                        console.log(`${chalk.bold('CPU:')}         ${stats.cpuPercent}%`);
                        console.log(`${chalk.bold('Memory:')}      ${stats.memoryMB} MB`);
                        console.log(`${chalk.bold('Threads:')}     ${stats.threads}`);
                        console.log(`${chalk.bold('Uptime:')}      ${formatUptime(stats.uptime)}`);
                    }
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

    // stint daemon logs
    daemon
        .command('logs')
        .description('View and filter daemon logs')
        .option('-l, --level <level>', 'Filter by log level (INFO, WARN, ERROR, DEBUG)')
        .option('-c, --category <category>', 'Filter by log category')
        .option('-s, --since <date>', 'Show logs since date/time (ISO format or relative time like "1h", "2d")')
        .option('-u, --until <date>', 'Show logs until date/time (ISO format or relative time like "1h", "2d")')
        .option('--search <text>', 'Search for specific text in log messages')
        .option('-f, --follow', 'Follow log output in real time')
        .option('-n, --lines <number>', 'Number of lines to show', '50')
        .action(async (command) => {
            const spinner = ora('Loading logs...').start();

            try {
                const logPath = path.join(os.homedir(), '.config', 'stint', 'logs', 'agent.log');
                if (!fs.existsSync(logPath)) {
                    spinner.fail('No logs found');
                    return;
                }

                // Parse time filters
                const now = new Date();
                let since: Date | undefined;
                let until: Date | undefined;

                if (command.since) {
                    if (command.since.match(/^\d+[hdw]$/)) {
                        const value = parseInt(command.since.slice(0, -1));
                        const unit = command.since.slice(-1) as 'h' | 'd' | 'w';
                        const ms = value * {
                            h: 60 * 60 * 1000,
                            d: 24 * 60 * 60 * 1000,
                            w: 7 * 24 * 60 * 60 * 1000
                        }[unit];
                        since = new Date(now.getTime() - ms);
                    } else {
                        since = new Date(command.since);
                    }
                }

                if (command.until) {
                    if (command.until.match(/^\d+[hdw]$/)) {
                        const value = parseInt(command.until.slice(0, -1));
                        const unit = command.until.slice(-1) as 'h' | 'd' | 'w';
                        const ms = value * {
                            h: 60 * 60 * 1000,
                            d: 24 * 60 * 60 * 1000,
                            w: 7 * 24 * 60 * 60 * 1000
                        }[unit];
                        until = new Date(now.getTime() - ms);
                    } else {
                        until = new Date(command.until);
                    }
                }

                const filter: LogFilter = {
                    level: command.level?.toUpperCase(),
                    category: command.category,
                    since,
                    until,
                    search: command.search
                };

                // If following logs, start from end
                const maxLines = command.follow ? 10 : parseInt(command.lines);
                const lines: string[] = [];
                const fileStream = fs.createReadStream(logPath, { encoding: 'utf8' });
                const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

                spinner.stop();

                for await (const line of rl) {
                    const parsed = parseLogLine(line);
                    if (parsed && shouldIncludeLine(parsed, filter)) {
                        lines.push(line);
                        if (lines.length > maxLines && !command.follow) {
                            lines.shift();
                        }
                    }
                }

                // Display filtered logs
                if (lines.length === 0) {
                    console.log(chalk.yellow('\nNo matching logs found\n'));
                    return;
                }

                console.log(); // Empty line for readability
                lines.forEach(line => {
                    const parsed = parseLogLine(line);
                    if (parsed) {
                        const { timestamp, level, category, message } = parsed;
                        console.log(
                            chalk.gray(`[${timestamp.toISOString()}]`),
                            colorizeLevel(level.padEnd(5)),
                            chalk.cyan(`[${category}]`),
                            message
                        );
                    }
                });
                console.log(); // Empty line for readability

                // Follow mode
                if (command.follow) {
                    console.log(chalk.gray('Following log output (Ctrl+C to exit)...\n'));
                    const tail = fs.watch(logPath, (eventType) => {
                        if (eventType === 'change') {
                            const newLines = fs.readFileSync(logPath, 'utf8')
                                .split('\n')
                                .slice(-1);

                            newLines.forEach(line => {
                                if (!line) return;
                                const parsed = parseLogLine(line);
                                if (parsed && shouldIncludeLine(parsed, filter)) {
                                    const { timestamp, level, category, message } = parsed;
                                    console.log(
                                        chalk.gray(`[${timestamp.toISOString()}]`),
                                        colorizeLevel(level.padEnd(5)),
                                        chalk.cyan(`[${category}]`),
                                        message
                                    );
                                }
                            });
                        }
                    });

                    // Clean up watcher on exit
                    process.on('SIGINT', () => {
                        tail.close();
                        console.log(chalk.gray('\nStopped following logs\n'));
                        process.exit(0);
                    });
                }

            } catch (error) {
                spinner.fail('Failed to read logs');
                logger.error('daemon', 'Logs command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });
}
