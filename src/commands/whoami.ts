import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { authService } from '../services/auth.js';
import { logger } from '../utils/logger.js';

export function registerWhoamiCommand(program: Command): void {
    program
        .command('whoami')
        .description('Show current user and machine information')
        .action(async () => {
            const spinner = ora('Checking authentication...').start();

            try {
                const token = await authService.getToken();
                if (!token) {
                    spinner.info('Not logged in');
                    console.log(chalk.yellow('\n⚠ You are not logged in.'));
                    console.log(chalk.gray('Run "stint login" to authenticate.\n'));
                    return;
                }

                spinner.text = 'Validating credentials...';
                const user = await authService.validateToken();

                if (!user) {
                    spinner.fail('Authentication invalid');
                    console.log(chalk.red('\n✖ Your authentication token is invalid or expired.'));
                    console.log(chalk.gray('Run "stint login" to re-authenticate.\n'));
                    await authService.clearToken();
                    return;
                }

                spinner.succeed('Authenticated');

                console.log(chalk.blue('\n👤 User Information:'));
                console.log(chalk.gray('─'.repeat(50)));
                console.log(`${chalk.bold('Name:')}     ${user.name}`);
                console.log(`${chalk.bold('Email:')}    ${user.email}`);
                console.log(`${chalk.bold('User ID:')}  ${user.id}`);

                console.log(chalk.blue('\n💻 Machine Information:'));
                console.log(chalk.gray('─'.repeat(50)));
                console.log(`${chalk.bold('Name:')}     ${authService.getMachineName()}`);
                console.log(`${chalk.bold('ID:')}       ${authService.getMachineId()}`);
                console.log();

                logger.info('whoami', `User: ${user.email}, Machine: ${authService.getMachineName()}`);
            } catch (error) {
                spinner.fail('Failed to retrieve information');
                logger.error('whoami', 'Command failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}`));
                process.exit(1);
            }
        });
}
