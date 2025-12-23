// Command: stint link

import { Command } from 'commander';
import { select, input } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import { gitService } from '../services/git.js';
import { projectService } from '../services/project.js';
import { apiService } from '../services/api.js';
import { logger } from '../utils/logger.js';
import process from 'process';

export function registerLinkCommand(program: Command): void {
    program
        .command('link')
        .description('Link current directory to a Stint project')
        .action(async () => {
            const spinner = ora('Checking directory...').start();

            try {
                const cwd = process.cwd();

                // Check if already linked
                const existingLink = projectService.getLinkedProject(cwd);
                if (existingLink) {
                    spinner.warn('Directory already linked');
                    console.log(chalk.yellow(`\n⚠ This directory is already linked to project ${existingLink.projectId}`));
                    console.log(chalk.gray('Run "stint unlink" first if you want to link to a different project.\n'));
                    return;
                }

                // Verify it's a git repository
                spinner.text = 'Verifying git repository...';
                const isRepo = await gitService.isRepo(cwd);
                if (!isRepo) {
                    spinner.fail('Not a git repository');
                    console.log(chalk.red('\n✖ This directory is not a git repository.'));
                    console.log(chalk.gray('Please run this command in a git repository.\n'));
                    process.exit(1);
                }

                // Fetch available projects
                spinner.text = 'Fetching projects...';
                const projects = await apiService.getLinkedProjects();

                if (projects.length === 0) {
                    spinner.info('No projects available');
                    console.log(chalk.yellow('\n⚠ No projects found in your Stint account.'));
                    console.log(chalk.gray('Create a project at https://stint.codes first.\n'));
                    return;
                }

                spinner.succeed('Ready to link');

                // Interactive project selection
                const choices = projects.map((project) => ({
                    name: project.name,
                    value: project.id,
                    description: `ID: ${project.id}`,
                }));

                const CREATE_NEW_PROJECT = 'create-new-project';
                choices.push({
                    name: '➕ Create new project',
                    value: CREATE_NEW_PROJECT,
                    description: 'Create a new project on Stint',
                });

                const selectedAction = await select({
                    message: 'Select a project to link:',
                    choices: choices,
                });

                let selectedProjectId = selectedAction;
                let selectedProject = projects.find((p) => p.id === selectedProjectId);

                if (selectedAction === CREATE_NEW_PROJECT) {
                    const name = await input({
                        message: 'Project name:',
                        default: path.basename(cwd),
                        validate: (input) => input.trim().length > 0 || 'Project name is required',
                    });

                    const description = await input({
                        message: 'Description (optional):',
                    });

                    const createSpinner = ora('Creating project...').start();

                    try {
                        // Gather git info for project metadata
                        let repoInfo = null;
                        if (isRepo) {
                            try {
                                repoInfo = await gitService.getRepoInfo(cwd);
                            } catch (e) {
                                logger.warn('link', `Failed to get repo info for creation metadata: ${(e as Error).message}`);
                            }
                        }

                        const newProject = await apiService.createProject({
                            name,
                            description: description || undefined,
                            repo_path: cwd,
                            remote_url: repoInfo?.remoteUrl || undefined,
                            default_branch: repoInfo?.currentBranch || undefined,
                        });

                        createSpinner.succeed('Project created successfully!');
                        selectedProjectId = newProject.id;
                        selectedProject = newProject;
                    } catch (error) {
                        createSpinner.fail('Failed to create project');
                        throw error;
                    }
                }

                // Link the project
                const linkSpinner = ora('Linking project...').start();
                await projectService.linkProject(cwd, selectedProjectId);
                linkSpinner.succeed('Project linked successfully!');

                console.log(chalk.green(`\n✓ Linked to ${chalk.bold(selectedProject?.name || selectedProjectId)}`));
                console.log(chalk.gray(`Directory: ${cwd}`));
                console.log(chalk.gray(`Project ID: ${selectedProjectId}\n`));

                logger.success('link', `Linked ${cwd} to project ${selectedProjectId}`);
            } catch (error) {
                spinner.fail('Failed to link project');
                logger.error('link', 'Link command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });
}
