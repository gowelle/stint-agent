import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
    validatePidFile,
    killProcess,
    spawnDetached,
    isProcessRunning,
} from '../utils/process.js';
import { logger } from '../utils/logger.js';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function registerUpdateCommand(program: Command): void {
    program
        .command('update')
        .description('Update stint agent to the latest version')
        .action(async () => {
            const spinner = ora('Checking for updates...').start();

            try {
                // 1. Get current version
                const currentVersion = program.version();

                // 2. Get latest version from npm
                const { stdout: latestVersion } = await execAsync('npm view @gowelle/stint-agent version');
                const cleanLatestVersion = latestVersion.trim();

                if (currentVersion === cleanLatestVersion) {
                    spinner.succeed('Already up to date');
                    console.log(chalk.gray(`\nCurrent version: ${currentVersion}`));
                    console.log(chalk.gray(`Latest version:  ${cleanLatestVersion}\n`));
                    return;
                }

                spinner.info(`Update available: ${currentVersion} → ${cleanLatestVersion}`);

                // 3. Install update
                spinner.text = 'Installing update...';
                await execAsync('npm install -g @gowelle/stint-agent@latest');

                spinner.succeed(`Updated to version ${cleanLatestVersion}`);

                // 4. Check if daemon is running and restart it
                const { valid, pid } = validatePidFile();
                if (valid && pid) {
                    console.log(chalk.blue('\n🔄 Restarting daemon with new version...'));
                    const restartSpinner = ora('Restarting daemon...').start();

                    try {
                        // Stop existing daemon
                        killProcess(pid, 'SIGTERM');

                        // Wait for stop
                        let attempts = 0;
                        while (attempts < 10 && isProcessRunning(pid)) {
                            await new Promise((resolve) => setTimeout(resolve, 500));
                            attempts++;
                        }

                        if (isProcessRunning(pid)) {
                            killProcess(pid, 'SIGKILL');
                        }

                        // Start new daemon
                        // We need to find the runner path again. 
                        // Note: We assume the structure is still the same after update.
                        // Since we are running from within the *old* process's memory, __dirname might point to old files if they were deleted/moved,
                        // but usually 'npm install -g' overwrites in place or swaps links.
                        // However, to be safe, we should probably use the newly installed binary to start the daemon,
                        // rather than spawning a node process from this potentially outdated script file.
                        // But 'stint daemon start' does exactly that.

                        // A safer bet for a global install update restart is to execute the 'stint' command itself? 
                        // Or just spawn the runner as before. 
                        // Let's stick to the pattern in daemon.ts for now, assuming the file path remains valid for the entry point.

                        // Wait a moment for file IO to settle
                        await new Promise((resolve) => setTimeout(resolve, 1000));

                        // Re-resolve runner path
                        // If we are in src/commands/update.ts (dev), runner is ../../dist/daemon/runner.js ??? 
                        // In prod, we are in dist/commands/update.js, runner is ../daemon/runner.js
                        // The 'daemon.ts' implementation uses: path.join(__dirname, 'daemon', 'runner.js')
                        // Wait, daemon.ts is in src/commands/, so __dirname is src/commands. 
                        // In prod dist/commands/daemon.js -> __dirname is dist/commands.
                        // Runner is at dist/daemon/runner.js. So path.join(__dirname, '..', 'daemon', 'runner.js') would be correct relative path?
                        // Let's check daemon.ts implementation again.

                        // daemon.ts: const runnerPath = path.join(__dirname, 'daemon', 'runner.js');
                        // Wait, if daemon.ts is in commands/, how does that work?
                        // Ah, looking at daemon.ts content:
                        // const runnerPath = path.join(__dirname, 'daemon', 'runner.js');
                        // If __dirname is .../commands, then it looks for .../commands/daemon/runner.js
                        // That seems wrong if the structure is src/commands/daemon.ts and src/daemon/runner.ts?
                        // Let's re-read the daemon.ts file content I viewed earlier.

                        // Line 53: const runnerPath = path.join(__dirname, 'daemon', 'runner.js');
                        // This implies that in 'dist', 'daemon' folder is alongside 'commands' folder? 
                        // Or is 'daemon' folder INSIDE 'commands' folder?
                        // I need to check the build structure or source structure.
                        // src/daemon/index.ts exists (based on list_dir earlier, wait, list_dir was commands).
                        // I'll check src/daemon existence.

                        // Assuming standard structure:
                        // src/commands/daemon.ts
                        // src/daemon/runner.ts (or index.ts)

                        // In dist:
                        // dist/commands/daemon.js
                        // dist/daemon/runner.js

                        // So from dist/commands/daemon.js, we need to go ../daemon/runner.js

                        // I will trust that the existing daemon.ts logic works, but I suspect I might need to adjust the path if I'm copy-pasting code that might be buggy or I misread it. 
                        // Let's double check daemon.ts content in a second.

                        // For now, I'll write the code to try to be robust.

                        // Actually, I'll use the "stint daemon start" command to restart it, 
                        // because that handles all the path resolution logic for us, using the *newly installed* binary.

                        await execAsync('stint daemon start');

                        restartSpinner.succeed('Daemon restarted successfully');
                        logger.success('update', `Daemon restarted after update`);

                    } catch (error) {
                        restartSpinner.fail('Failed to restart daemon');
                        logger.error('update', 'Daemon restart failed', error as Error);
                        console.log(chalk.yellow('\nPlease run "stint daemon start" manually.\n'));
                    }
                }

                logger.success('update', `Updated to version ${cleanLatestVersion}`);

            } catch (error) {
                spinner.fail('Update failed');
                logger.error('update', 'Update command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });
}
