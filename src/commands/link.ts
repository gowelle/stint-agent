// Link Command - Phase 2
// Command: stint link

import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';
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
                    console.log(chalk.gray('Create a project at https://stint.app first.\n'));
                    return;
                }

                spinner.succeed('Ready to link');

                // Interactive project selection
                const selectedProjectId = await select({
                    message: 'Select a project to link:',
                    choices: projects.map((project) => ({
                        name: `${project.name}${project.description ? ` - ${project.description}` : ''}`,
                        value: project.id,
                        description: `ID: ${project.id}`,
                    })),
                });

                // Link the project
                const linkSpinner = ora('Linking project...').start();
                await projectService.linkProject(cwd, selectedProjectId);

                const selectedProject = projects.find((p) => p.id === selectedProjectId);
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
