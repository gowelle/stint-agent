// Command: stint sync

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { projectService } from '../services/project.js';
import { gitService } from '../services/git.js';
import { apiService } from '../services/api.js';
import { logger } from '../utils/logger.js';
import process from 'process';

export function registerSyncCommand(program: Command): void {
    program
        .command('sync')
        .description('Manually sync repository information to server')
        .action(async () => {
            const spinner = ora('Checking directory...').start();

            try {
                const cwd = process.cwd();

                // Verify directory is linked
                const linkedProject = await projectService.getLinkedProject(cwd);
                if (!linkedProject) {
                    spinner.fail('Not linked');
                    console.log(chalk.yellow('\n⚠ This directory is not linked to any project.'));
                    console.log(chalk.gray('Run "stint link" first to link this directory.\n'));
                    process.exit(1);
                }

                // Gather repository information
                spinner.text = 'Gathering repository information...';
                const repoInfo = await gitService.getRepoInfo(cwd);

                // Send sync request to API
                spinner.text = 'Syncing with server...';
                await apiService.syncProject(linkedProject.projectId, repoInfo);

                spinner.succeed('Sync completed successfully!');

                console.log(chalk.green('\n✓ Repository information synced'));
                console.log(chalk.gray('─'.repeat(50)));
                console.log(`${chalk.bold('Project ID:')}  ${linkedProject.projectId}`);
                console.log(`${chalk.bold('Branch:')}      ${repoInfo.currentBranch}`);
                console.log(`${chalk.bold('Commit:')}      ${repoInfo.lastCommitSha.substring(0, 7)} - ${repoInfo.lastCommitMessage}`);
                console.log(`${chalk.bold('Remote:')}      ${repoInfo.remoteUrl || chalk.gray('None')}`);
                console.log();

                logger.success('sync', `Synced ${cwd} to project ${linkedProject.projectId}`);
            } catch (error) {
                spinner.fail('Sync failed');
                logger.error('sync', 'Sync command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });
}
