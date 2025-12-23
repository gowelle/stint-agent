import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { authService } from '../services/auth.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

// Constants
const WINDOWS_TASK_NAME = 'StintAgentDaemon';
const MAC_PLIST_NAME = 'codes.stint.agent.plist';
const SYSTEMD_SERVICE_NAME = 'stint-agent.service';

/**
 * Get the command to run the daemon
 */
export function getDaemonCommand(): string {
    // Use the current script path as the entry point
    // This works for both dev (ts-node src/index.ts) and prod (node dist/index.js)
    const scriptPath = process.argv[1];
    return `"${process.execPath}" "${scriptPath}" daemon start`;
}

/**
 * Windows implementation
 */
export async function installWindows(): Promise<void> {
    const command = getDaemonCommand();

    // For schtasks, we need to escape backslashes and double quotes
    // The command is like: "C:\Path\node.exe" "C:\Path\script.js" daemon start
    // We need to wrap it in quotes for /TR, and escape internal quotes with backslash
    const escapedCommand = command.replace(/"/g, '\\"');

    try {
        await execAsync(`schtasks /Create /SC ONLOGON /TN "${WINDOWS_TASK_NAME}" /TR "${escapedCommand}" /F`);
    } catch (error) {
        if ((error as Error).message.includes('Access is denied')) {
            throw new Error('Access denied. Please run this command as Administrator (Right-click Terminal > Run as administrator).');
        }
        throw error;
    }
}

export async function uninstallWindows(): Promise<void> {
    await execAsync(`schtasks /Delete /TN "${WINDOWS_TASK_NAME}" /F`);
}

/**
 * macOS implementation
 */
export function getMacPlistContent(): string {
    const scriptPath = process.argv[1];
    const logPath = path.join(os.homedir(), '.config', 'stint', 'logs', 'launchd.log');
    const errorPath = path.join(os.homedir(), '.config', 'stint', 'logs', 'launchd.error.log');

    // Ensure log dir exists
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>codes.stint.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>${scriptPath}</string>
        <string>daemon</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${errorPath}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>`;
}

export async function installMac(): Promise<void> {
    const plistContent = getMacPlistContent();
    const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    const plistPath = path.join(launchAgentsDir, MAC_PLIST_NAME);

    if (!fs.existsSync(launchAgentsDir)) {
        fs.mkdirSync(launchAgentsDir, { recursive: true });
    }

    fs.writeFileSync(plistPath, plistContent);

    // Unload if exists, then load
    try {
        await execAsync(`launchctl unload "${plistPath}"`);
    } catch {
        // Ignore error if not loaded
    }

    await execAsync(`launchctl load "${plistPath}"`);
}

export async function uninstallMac(): Promise<void> {
    const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    const plistPath = path.join(launchAgentsDir, MAC_PLIST_NAME);

    if (fs.existsSync(plistPath)) {
        try {
            await execAsync(`launchctl unload "${plistPath}"`);
        } catch {
            // Ignore
        }
        fs.unlinkSync(plistPath);
    }
}

/**
 * Linux implementation (systemd)
 */
export function getSystemdServiceContent(): string {
    const scriptPath = process.argv[1];

    return `[Unit]
Description=Stint Agent (Project Assistant)
After=network.target

[Service]
Type=forking
ExecStart=${process.execPath} "${scriptPath}" daemon start
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target`;
}

export async function installLinux(): Promise<void> {
    const systemdDir = path.join(os.homedir(), '.config', 'systemd', 'user');
    const servicePath = path.join(systemdDir, SYSTEMD_SERVICE_NAME);

    if (!fs.existsSync(systemdDir)) {
        fs.mkdirSync(systemdDir, { recursive: true });
    }

    const serviceContent = getSystemdServiceContent();
    fs.writeFileSync(servicePath, serviceContent);

    await execAsync('systemctl --user daemon-reload');
    await execAsync(`systemctl --user enable ${SYSTEMD_SERVICE_NAME}`);
    await execAsync(`systemctl --user start ${SYSTEMD_SERVICE_NAME}`);
}

export async function uninstallLinux(): Promise<void> {
    const systemdDir = path.join(os.homedir(), '.config', 'systemd', 'user');
    const servicePath = path.join(systemdDir, SYSTEMD_SERVICE_NAME);

    try {
        await execAsync(`systemctl --user stop ${SYSTEMD_SERVICE_NAME}`);
        await execAsync(`systemctl --user disable ${SYSTEMD_SERVICE_NAME}`);
    } catch {
        // Ignore errors
    }

    if (fs.existsSync(servicePath)) {
        fs.unlinkSync(servicePath);
        await execAsync('systemctl --user daemon-reload');
    }
}

export function registerInstallCommand(program: Command): void {
    program
        .command('install')
        .description('Install stint agent to run on system startup')
        .action(async () => {
            const spinner = ora('Checking authentication...').start();

            try {
                // 1. Check Auth
                const user = await authService.validateToken();
                if (!user) {
                    spinner.fail('Not authenticated');
                    console.log(chalk.red('\n✖ You must be logged in to install the background agent on startup.'));
                    console.log(chalk.gray('Run "stint login" first.\n'));
                    process.exit(1);
                }

                spinner.text = 'Installing startup agent...';

                // 2. Install based on platform
                const platform = os.platform();

                if (platform === 'win32') {
                    await installWindows();
                } else if (platform === 'darwin') {
                    await installMac();
                } else if (platform === 'linux') {
                    await installLinux();
                } else {
                    throw new Error(`Unsupported platform: ${platform}`);
                }

                spinner.succeed('Installed successfully!');
                console.log(chalk.green(`\n✓ Stint agent configured to start on login`));

                if (platform === 'win32') {
                    console.log(chalk.gray(`Registered Task Scheduler task: ${WINDOWS_TASK_NAME}`));
                } else if (platform === 'darwin') {
                    console.log(chalk.gray(`Created LaunchAgent: ~/Library/LaunchAgents/${MAC_PLIST_NAME}`));
                } else if (platform === 'linux') {
                    console.log(chalk.gray(`Created systemd user service: ${SYSTEMD_SERVICE_NAME}`));
                }
                console.log();

                logger.success('install', `Agent installed on startup for ${platform}`);

            } catch (error) {
                spinner.fail('Installation failed');
                logger.error('install', 'Install command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });
}

export function registerUninstallCommand(program: Command): void {
    program
        .command('uninstall')
        .description('Remove stint agent from system startup')
        .action(async () => {
            const spinner = ora('Removing startup agent...').start();

            try {
                const platform = os.platform();

                if (platform === 'win32') {
                    await uninstallWindows();
                } else if (platform === 'darwin') {
                    await uninstallMac();
                } else if (platform === 'linux') {
                    await uninstallLinux();
                } else {
                    throw new Error(`Unsupported platform: ${platform}`);
                }

                spinner.succeed('Uninstalled successfully');
                console.log(chalk.gray('\nStint agent removed from system startup.\n'));

                logger.success('install', `Agent uninstalled from startup for ${platform}`);

            } catch (error) {
                spinner.fail('Uninstall failed');
                logger.error('install', 'Uninstall command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });
}
