#!/usr/bin/env node

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

const program = new Command();

program
    .name('stint')
    .description('Stint Agent - Local daemon for Stint Project Assistant')
    .version('1.0.0')
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

// Register Phase 1 commands
registerLoginCommand(program);
registerLogoutCommand(program);
registerWhoamiCommand(program);

// Register Phase 2 commands
registerLinkCommand(program);
registerUnlinkCommand(program);
registerStatusCommand(program);
registerSyncCommand(program);

// Register Phase 3 commands
registerDaemonCommands(program);

// Register Phase 5 commands
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
