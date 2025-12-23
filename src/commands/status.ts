import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { projectService } from '../services/project.js';
import { gitService } from '../services/git.js';
import { authService } from '../services/auth.js';
import { logger } from '../utils/logger.js';
import process from 'process';
import path from 'path';
import os from 'os';
import { validatePidFile } from '../utils/process.js';

export function registerStatusCommand(program: Command): void {
    program
        .command('status')
        .description('Show linked project and connection status')
        .action(async () => {
            const spinner = ora('Gathering status...').start();

            try {
                const cwd = process.cwd();

                // Get linked project
                const linkedProject = await projectService.getLinkedProject(cwd);

                // Get authentication status
                const user = await authService.validateToken();

                spinner.stop();

                // Display Project Status
                console.log(chalk.blue('\n📦 Project Status:'));
                console.log(chalk.gray('─'.repeat(50)));
                if (linkedProject) {
                    console.log(`${chalk.bold('Status:')}      ${chalk.green('✓ Linked')}`);
                    console.log(`${chalk.bold('Project ID:')}  ${linkedProject.projectId}`);
                    console.log(`${chalk.bold('Linked At:')}   ${new Date(linkedProject.linkedAt).toLocaleString()}`);
                } else {
                    console.log(`${chalk.bold('Status:')}      ${chalk.yellow('Not linked')}`);
                    console.log(chalk.gray('Run "stint link" to link this directory to a project.'));
                }

                // Display Git Repository Status
                console.log(chalk.blue('\n📂 Git Repository:'));
                console.log(chalk.gray('─'.repeat(50)));

                const isRepo = await gitService.isRepo(cwd);
                if (isRepo) {
                    try {
                        const repoInfo = await gitService.getRepoInfo(cwd);
                        console.log(`${chalk.bold('Branch:')}        ${chalk.cyan(repoInfo.currentBranch)}`);
                        console.log(`${chalk.bold('Remote:')}        ${repoInfo.remoteUrl || chalk.gray('None')}`);
                        console.log(`${chalk.bold('Last Commit:')}   ${repoInfo.lastCommitSha.substring(0, 7)} - ${repoInfo.lastCommitMessage}`);
                        console.log(`${chalk.bold('Commit Date:')}   ${new Date(repoInfo.lastCommitDate).toLocaleString()}`);

                        const { staged, unstaged, untracked, ahead, behind } = repoInfo.status;
                        const totalChanges = staged.length + unstaged.length + untracked.length;

                        if (totalChanges > 0) {
                            console.log(`${chalk.bold('Changes:')}      ${chalk.yellow(`${totalChanges} file(s)`)}`);
                            if (staged.length > 0) console.log(`  ${chalk.green('Staged:')}     ${staged.length}`);
                            if (unstaged.length > 0) console.log(`  ${chalk.yellow('Unstaged:')}   ${unstaged.length}`);
                            if (untracked.length > 0) console.log(`  ${chalk.gray('Untracked:')}  ${untracked.length}`);
                        } else {
                            console.log(`${chalk.bold('Changes:')}      ${chalk.green('Clean working tree')}`);
                        }

                        if (ahead > 0 || behind > 0) {
                            console.log(`${chalk.bold('Sync Status:')}  ${ahead > 0 ? chalk.yellow(`↑${ahead}`) : ''} ${behind > 0 ? chalk.yellow(`↓${behind}`) : ''}`);
                        }
                    } catch {
                        console.log(chalk.red('Error reading repository information'));
                    }
                } else {
                    console.log(chalk.yellow('Not a git repository'));
                }

                // Display Connection Status
                console.log(chalk.blue('\n🔐 Authentication:'));
                console.log(chalk.gray('─'.repeat(50)));
                if (user) {
                    console.log(`${chalk.bold('Status:')}      ${chalk.green('✓ Authenticated')}`);
                    console.log(`${chalk.bold('User:')}        ${user.name} (${user.email})`);
                    console.log(`${chalk.bold('Machine:')}     ${authService.getMachineName()}`);
                } else {
                    console.log(`${chalk.bold('Status:')}      ${chalk.yellow('Not logged in')}`);
                    console.log(chalk.gray('Run "stint login" to authenticate.'));
                }


                // Daemon Status
                console.log(chalk.blue('\n⚙️  Daemon:'));
                console.log(chalk.gray('─'.repeat(50)));

                const { valid, pid } = validatePidFile();

                if (valid && pid) {
                    console.log(`${chalk.bold('Status:')}      ${chalk.green('✓ Running')}`);
                    console.log(`${chalk.bold('PID:')}         ${pid}`);
                    console.log(`${chalk.bold('Logs:')}        ${path.join(os.homedir(), '.config', 'stint', 'logs', 'daemon.log')}`);
                } else {
                    console.log(`${chalk.bold('Status:')}      ${chalk.yellow('Not running')}`);
                    console.log(chalk.gray('Run "stint daemon start" to start the background agent.'));
                }
                console.log();

                logger.info('status', 'Status command executed');
            } catch (error) {
                spinner.fail('Failed to get status');
                logger.error('status', 'Status command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });
}
