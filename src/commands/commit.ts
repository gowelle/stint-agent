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
                const linkedProject = await projectService.getLinkedProject(cwd);
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
        .option('--auto-stage', 'Automatically stage files specified in the pending commit')
        .option('--push', 'Push changes to remote after committing')
        .option('--force', 'Skip file validation warnings')
        .action(async (id: string, options: { autoStage?: boolean; push?: boolean; force?: boolean }) => {
            let activeSpinner: ReturnType<typeof ora> | null = null;

            try {
                activeSpinner = ora('Checking repository status...').start();
                const cwd = process.cwd();

                // Check if directory is linked
                const linkedProject = await projectService.getLinkedProject(cwd);
                if (!linkedProject) {
                    activeSpinner.fail('Not linked');
                    console.log(chalk.yellow('\n⚠ This directory is not linked to any project.'));
                    console.log(chalk.gray('Run "stint link" first to link this directory.\n'));
                    process.exit(1);
                }

                // Fetch pending commits to find the one we want
                activeSpinner.text = 'Fetching commit details...';
                const commits = await apiService.getPendingCommits(linkedProject.projectId);

                // Find commits by ID (support partial ID) with collision detection
                const matchingCommits = commits.filter((c) => c.id.startsWith(id));

                if (matchingCommits.length === 0) {
                    activeSpinner.fail('Commit not found');
                    console.log(chalk.red(`\n✖ Commit ${id} not found in pending commits.\n`));
                    console.log(chalk.gray('Run "stint commits" to see available commits.\n'));
                    process.exit(1);
                }

                if (matchingCommits.length > 1) {
                    activeSpinner.fail('Ambiguous commit ID');
                    console.log(chalk.yellow(`\n⚠ Multiple commits match "${id}":\n`));
                    matchingCommits.forEach(c => {
                        const shortId = c.id.substring(0, 12);
                        console.log(`  ${chalk.cyan(shortId)}  ${c.message}`);
                    });
                    console.log(chalk.gray('\nPlease use a longer ID to be more specific.\n'));
                    process.exit(1);
                }

                const commit = matchingCommits[0];

                // Get current status
                let status = await gitService.getStatus(cwd);

                // Handle auto-staging if requested
                if (options.autoStage && commit.files && commit.files.length > 0) {
                    activeSpinner.text = `Staging ${commit.files.length} files...`;
                    await gitService.stageFiles(cwd, commit.files);
                    status = await gitService.getStatus(cwd);
                    logger.info('commit', `Auto-staged files: ${commit.files.join(', ')}`);
                }

                // Check for staged changes (after potential auto-staging)
                if (status.staged.length === 0) {
                    activeSpinner.fail('No staged changes');
                    console.log(chalk.yellow('\n⚠ No staged changes detected.'));
                    if (commit.files && commit.files.length > 0) {
                        console.log(chalk.gray('Expected files: ' + commit.files.join(', ')));
                        console.log(chalk.gray('\nUse --auto-stage to automatically stage expected files.'));
                    } else {
                        console.log(chalk.gray('Please stage the files you want to commit first.'));
                        console.log(chalk.gray('  git add <files>\n'));
                    }
                    process.exit(1);
                }

                // Validate staged files match expected files (if specified and not forced)
                if (commit.files && commit.files.length > 0 && !options.force && !options.autoStage) {
                    const stagedSet = new Set(status.staged);
                    const expectedSet = new Set(commit.files);

                    const missing = commit.files.filter(f => !stagedSet.has(f));
                    const extra = status.staged.filter(f => !expectedSet.has(f));

                    if (missing.length > 0 || extra.length > 0) {
                        activeSpinner.stop();
                        console.log(chalk.yellow('\n⚠ Staged files do not match expected files:\n'));

                        if (missing.length > 0) {
                            console.log(chalk.red('  Missing (expected but not staged):'));
                            missing.forEach(f => console.log(chalk.red(`    - ${f}`)));
                        }

                        if (extra.length > 0) {
                            console.log(chalk.yellow('\n  Extra (staged but not expected):'));
                            extra.forEach(f => console.log(chalk.yellow(`    + ${f}`)));
                        }

                        console.log();
                        const proceed = await confirm({
                            message: 'Do you want to proceed anyway?',
                            default: false,
                        });

                        if (!proceed) {
                            console.log(chalk.gray('\nCommit cancelled. Use --auto-stage to stage expected files.\n'));
                            return;
                        }

                        activeSpinner = ora('Continuing...').start();
                    }
                }

                activeSpinner.stop();

                // Show staged files and confirm
                console.log(chalk.blue('\n📋 Staged changes to commit:'));
                console.log(chalk.gray('─'.repeat(40)));
                status.staged.forEach(file => {
                    console.log(chalk.green(`  + ${file}`));
                });
                console.log();
                console.log(`${chalk.bold('Message:')}    ${commit.message}`);
                if (options.push) {
                    console.log(`${chalk.bold('Push:')}       ${chalk.cyan('Yes (will push after commit)')}`);
                }
                console.log();

                const confirmed = await confirm({
                    message: 'Are you sure you want to commit these changes?',
                    default: true,
                });

                if (!confirmed) {
                    console.log(chalk.yellow('\nCommit cancelled.\n'));
                    return;
                }

                activeSpinner = ora('Preparing commit...').start();

                // Create project object for execution
                const project = {
                    id: linkedProject.projectId,
                    name: 'Current Project',
                    createdAt: '',
                    updatedAt: '',
                };

                const sha = await commitQueue.executeCommit(commit, project, (stage) => {
                    if (activeSpinner) activeSpinner.text = stage;
                }, { push: options.push ?? false });

                activeSpinner.succeed('Commit executed successfully!');

                console.log(chalk.green('\n✓ Commit executed'));
                console.log(chalk.gray('─'.repeat(50)));
                console.log(`${chalk.bold('Commit ID:')}  ${commit.id}`);
                console.log(`${chalk.bold('Message:')}    ${commit.message}`);
                console.log(`${chalk.bold('SHA:')}        ${sha}`);
                console.log(`${chalk.bold('Files:')}      ${status.staged.length} files committed`);
                if (options.push) {
                    console.log(`${chalk.bold('Pushed:')}     ${chalk.green('Yes')}`);
                }
                console.log();

                // Show committed files
                if (status.staged.length > 0) {
                    console.log(chalk.gray('Committed files:'));
                    status.staged.forEach(file => {
                        console.log(chalk.green(`  + ${file}`));
                    });
                    console.log();
                }

                logger.success('commit', `Executed commit ${commit.id} -> ${sha}`);
            } catch (error) {
                activeSpinner?.fail('Commit execution failed');
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
