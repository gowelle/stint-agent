// Command: stint sync

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { projectService } from '../services/project.js';
import { gitService } from '../services/git.js';
import { apiService } from '../services/api.js';
import { logger } from '../utils/logger.js';
import { GitStatus } from '../types/index.js';
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

                // Start gathering repository information
                spinner.text = 'Analyzing repository...';
                
                // Check repository status first
                const status: GitStatus = await gitService.getStatus(cwd);
                const totalFiles = status.staged.length + status.unstaged.length + status.untracked.length;
                
                spinner.text = `Found ${totalFiles} files to analyze...`;
                
                // Gather detailed repository information with progress updates
                spinner.text = 'Getting branch information...';
                const repoInfo = await gitService.getRepoInfo(cwd);
                
                // Show sync progress
                spinner.text = 'Preparing sync payload...';
                const syncSpinner = ora('Connecting to server...').start();
                
                try {
                    await apiService.syncProject(linkedProject.projectId, repoInfo);
                    syncSpinner.succeed('Server sync completed');
                } catch (error) {
                    syncSpinner.fail('Server sync failed');
                    throw error;
                }

                console.log(chalk.green('\n✓ Repository sync completed'));
                console.log(chalk.gray('─'.repeat(50)));
                console.log(`${chalk.bold('Files:')}       ${totalFiles} total (${status.staged.length} staged, ${status.unstaged.length} modified, ${status.untracked.length} untracked)`);
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
