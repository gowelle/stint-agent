import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import { projectService } from '../services/project.js';
import { apiService } from '../services/api.js';
import { gitService } from '../services/git.js';
import { commitQueue } from '../daemon/queue.js';
import { logger } from '../utils/logger.js';
import process from 'process';

export function registerCommitCommands(program: Command): void {
    // stint commits - List pending commits
    program
        .command('commits')
        .description('List pending commits for the current project')
        .action(async () => {
            const spinner = ora('Loading pending commits...').start();

            try {
                const cwd = process.cwd();

                // Check if directory is linked
                const linkedProject = projectService.getLinkedProject(cwd);
                if (!linkedProject) {
                    spinner.fail('Not linked');
                    console.log(chalk.yellow('\n⚠ This directory is not linked to any project.'));
                    console.log(chalk.gray('Run "stint link" first to link this directory.\n'));
                    process.exit(1);
                }

                // Fetch pending commits from API
                spinner.text = 'Fetching pending commits...';
                const commits = await apiService.getPendingCommits(linkedProject.projectId);

                spinner.stop();

                if (commits.length === 0) {
                    console.log(chalk.blue('\n📋 No pending commits\n'));
                    console.log(chalk.gray('All commits have been executed.\n'));
                    return;
                }

                console.log(chalk.blue(`\n📋 Pending Commits (${commits.length}):\n`));

                commits.forEach((commit) => {
                    const shortId = commit.id.substring(0, 7);
                    const date = new Date(commit.createdAt);
                    const timeAgo = getTimeAgo(date);

                    console.log(`  ${chalk.cyan(shortId)}  ${commit.message.padEnd(40)}  ${chalk.gray(timeAgo)}`);

                    if (commit.files && commit.files.length > 0) {
                        console.log(chalk.gray(`           Files: ${commit.files.join(', ')}`));
                    }
                });

                console.log(chalk.gray('\nRun "stint commit <id>" to execute a specific commit.\n'));

                logger.info('commits', `Listed ${commits.length} pending commits`);
            } catch (error) {
                spinner.fail('Failed to fetch commits');
                logger.error('commits', 'Failed to fetch commits', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });

    // stint commit <id> - Execute specific commit
    program
        .command('commit <id>')
        .description('Execute a specific pending commit')
        .action(async (id: string) => {
            const spinner = ora('Checking repository status...').start();

            try {
                const cwd = process.cwd();

                // Check if directory is linked
                const linkedProject = projectService.getLinkedProject(cwd);
                if (!linkedProject) {
                    spinner.fail('Not linked');
                    console.log(chalk.yellow('\n⚠ This directory is not linked to any project.'));
                    console.log(chalk.gray('Run "stint link" first to link this directory.\n'));
                    process.exit(1);
                }

                // Check for staged changes
                const status = await gitService.getStatus(cwd);
                if (status.staged.length === 0) {
                    spinner.fail('No staged changes');
                    console.log(chalk.yellow('\n⚠ No staged changes detected.'));
                    console.log(chalk.gray('Please stage the files you want to commit first.'));
                    console.log(chalk.gray('  git add <files>\n'));
                    process.exit(1);
                }

                // Fetch pending commits to find the one we want
                spinner.text = 'Fetching commit details...';
                const commits = await apiService.getPendingCommits(linkedProject.projectId);

                // Find commit by ID (support partial ID)
                const commit = commits.find((c) => c.id.startsWith(id));

                if (!commit) {
                    spinner.fail('Commit not found');
                    console.log(chalk.red(`\n✖ Commit ${id} not found in pending commits.\n`));
                    console.log(chalk.gray('Run "stint commits" to see available commits.\n'));
                    process.exit(1);
                }

                spinner.stop();

                // Show staged files and confirm
                console.log(chalk.blue('\n📋 Staged changes to commit:'));
                console.log(chalk.gray('─'.repeat(40)));
                status.staged.forEach(file => {
                    console.log(chalk.green(`  + ${file}`));
                });
                console.log();
                console.log(`${chalk.bold('Message:')}    ${commit.message}`);
                console.log();

                const confirmed = await confirm({
                    message: 'Are you sure you want to commit these changes?',
                    default: true,
                });

                if (!confirmed) {
                    console.log(chalk.yellow('\nCommit cancelled.\n'));
                    return;
                }

                const execSpinner = ora('Executing commit...').start();

                // We need to create a minimal project object for execution
                const project = {
                    id: linkedProject.projectId,
                    name: 'Current Project', // We don't have the name, but it's not critical
                    createdAt: '',
                    updatedAt: '',
                };

                const sha = await commitQueue.executeCommit(commit, project);

                execSpinner.succeed('Commit executed successfully!');

                console.log(chalk.green('\n✓ Commit executed'));
                console.log(chalk.gray('─'.repeat(50)));
                console.log(`${chalk.bold('Commit ID:')}  ${commit.id}`);
                console.log(`${chalk.bold('Message:')}    ${commit.message}`);
                console.log(`${chalk.bold('SHA:')}        ${sha}`);
                console.log();

                logger.success('commit', `Executed commit ${commit.id} -> ${sha}`);
            } catch (error) {
                // If spinner is still spinning, stop it
                if (ora().isSpinning) {
                    ora().fail('Commit execution failed');
                }

                logger.error('commit', 'Failed to execute commit', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(date: Date): string {
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    return date.toLocaleDateString();
}
