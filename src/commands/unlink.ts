import { Command } from 'commander';
import { confirm } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';
import { projectService } from '../services/project.js';
import { logger } from '../utils/logger.js';
import process from 'process';

export function registerUnlinkCommand(program: Command): void {
    program
        .command('unlink')
        .description('Remove link from current directory')
        .option('-f, --force', 'Skip confirmation prompt')
        .action(async (options) => {
            const spinner = ora('Checking directory...').start();

            try {
                const cwd = process.cwd();

                // Check if directory is linked
                const linkedProject = await projectService.getLinkedProject(cwd);
                if (!linkedProject) {
                    spinner.info('Not linked');
                    console.log(chalk.yellow('\n⚠ This directory is not linked to any project.\n'));
                    return;
                }

                spinner.stop();

                // Show current link info
                console.log(chalk.blue('\n📋 Current Link:'));
                console.log(chalk.gray('─'.repeat(50)));
                console.log(`${chalk.bold('Project ID:')}  ${linkedProject.projectId}`);
                console.log(`${chalk.bold('Linked At:')}   ${new Date(linkedProject.linkedAt).toLocaleString()}`);
                console.log();

                // Confirm unlinking (unless --force)
                if (!options.force) {
                    const shouldUnlink = await confirm({
                        message: 'Are you sure you want to unlink this directory?',
                        default: false,
                    });

                    if (!shouldUnlink) {
                        console.log(chalk.gray('Cancelled.\n'));
                        return;
                    }
                }

                // Unlink
                const unlinkSpinner = ora('Unlinking...').start();
                await projectService.unlinkProject(cwd);

                unlinkSpinner.succeed('Unlinked successfully');
                console.log(chalk.gray(`\nDirectory ${cwd} is no longer linked.\n`));

                logger.success('unlink', `Unlinked ${cwd}`);
            } catch (error) {
                spinner.fail('Failed to unlink');
                logger.error('unlink', 'Unlink command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });
}
