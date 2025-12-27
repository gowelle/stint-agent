import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { versionService } from '../services/version.js';
import { updateService } from '../services/update.js';
import { logger } from '../utils/logger.js';
import prompts from 'prompts';

export function registerUpdateCommand(program: Command): void {
    program
        .command('update')
        .description('Update stint-agent to the latest version')
        .option('--check', 'Check for updates without installing')
        .option('--channel <channel>', 'Release channel (stable or beta)', 'stable')
        .option('-y, --yes', 'Skip confirmation prompt')
        .action(async (options) => {
            try {
                const channel = options.channel === 'beta' ? 'beta' : 'stable';

                // Check for updates
                const spinner = ora('Checking for updates...').start();
                const versionInfo = await versionService.checkForUpdates(channel);
                spinner.stop();

                console.log(chalk.blue('\n📦 Version Information:'));
                console.log(chalk.gray('─'.repeat(50)));
                console.log(`${chalk.bold('Current:')}  ${versionInfo.current}`);
                console.log(`${chalk.bold('Latest:')}   ${versionInfo.latest} (${channel})`);
                console.log();

                if (!versionInfo.hasUpdate) {
                    console.log(chalk.green('✓ You are already on the latest version!\n'));
                    return;
                }

                console.log(chalk.yellow(`⚠ Update available: ${versionInfo.current} → ${versionInfo.latest}\n`));

                // If --check flag, just show info and exit
                if (options.check) {
                    console.log(chalk.gray('Run "stint update" to install the latest version.\n'));
                    return;
                }

                // Confirm update
                if (!options.yes) {
                    const response = await prompts({
                        type: 'confirm',
                        name: 'proceed',
                        message: 'Do you want to update now?',
                        initial: true,
                    });

                    if (!response.proceed) {
                        console.log(chalk.gray('\nUpdate cancelled.\n'));
                        return;
                    }
                }

                // Perform update
                console.log();
                const result = await updateService.performUpdate(channel);

                if (result.success) {
                    console.log(chalk.green(`\n✓ Successfully updated to ${versionInfo.latest}!\n`));
                    logger.success('update', `Updated to ${versionInfo.latest}`);
                } else {
                    console.log(chalk.red(`\n✖ Update failed: ${result.error}\n`));
                    process.exit(1);
                }
            } catch (error) {
                logger.error('update', 'Update command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });
}
