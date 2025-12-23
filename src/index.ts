#!/usr/bin/env node
import 'dotenv/config';

import { Command } from 'commander';
import chalk from 'chalk';
import { registerLoginCommand } from './commands/login.js';
import { registerLogoutCommand } from './commands/logout.js';
import { registerWhoamiCommand } from './commands/whoami.js';
import { registerLinkCommand } from './commands/link.js';
import { registerUnlinkCommand } from './commands/unlink.js';
import { registerStatusCommand } from './commands/status.js';
import { registerSyncCommand } from './commands/sync.js';
import { registerDaemonCommands } from './commands/daemon.js';
import { registerCommitCommands } from './commands/commit.js';
import { logger } from './utils/logger.js';

// Version is injected at build time via tsup define
const AGENT_VERSION = process.env.AGENT_VERSION || '0.0.0';

const program = new Command();

program
    .name('stint')
    .description('Stint Agent - Local daemon for Stint Project Assistant')
    .version(AGENT_VERSION, '-V, --version', 'output the current version')
    .addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.cyan('$')} stint login                 ${chalk.gray('# Authenticate with Stint')}
  ${chalk.cyan('$')} stint link                  ${chalk.gray('# Link current directory to a project')}
  ${chalk.cyan('$')} stint daemon start          ${chalk.gray('# Start background daemon')}
  ${chalk.cyan('$')} stint status                ${chalk.gray('# Check status')}
  ${chalk.cyan('$')} stint commits               ${chalk.gray('# List pending commits')}

${chalk.bold('Documentation:')}
  For more information, visit: ${chalk.blue('https://stint.codes/docs')}
    `);

// Register commands
registerLoginCommand(program);
registerLogoutCommand(program);
registerWhoamiCommand(program);
registerLinkCommand(program);
registerUnlinkCommand(program);
registerStatusCommand(program);
registerSyncCommand(program);
registerDaemonCommands(program);
registerCommitCommands(program);



// Error handling
program.exitOverride();

try {
    await program.parseAsync(process.argv);
} catch (error) {
    const commanderError = error as Error & { code?: string };
    if (commanderError.code !== 'commander.help' && commanderError.code !== 'commander.version') {
        logger.error('cli', 'Command execution failed', error as Error);
        console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
        process.exit(1);
    }
}
