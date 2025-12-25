import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { apiService } from '../services/api.js';
import { authService } from '../services/auth.js';
import { websocketService } from '../services/websocket.js';
import { logger } from '../utils/logger.js';
import { formatApiError, isServiceUnavailable } from '../utils/api-errors.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import process from 'process';

const execAsync = promisify(exec);

interface HealthCheck {
    name: string;
    check: () => Promise<{ success: boolean; message: string; details?: string[] }>;
}

export function registerDoctorCommand(program: Command): void {
    program
        .command('doctor')
        .description('Run diagnostics to check environment health')
        .action(async () => {
            const spinner = ora('Running diagnostics...').start();
            let hasErrors = false;

            try {
                // Define all health checks
                const checks: HealthCheck[] = [
                    {
                        name: 'Git Installation',
                        check: async () => {
                            try {
                                const { stdout } = await execAsync('git --version');
                                return {
                                    success: true,
                                    message: `Git ${stdout.trim()} found`,
                                };
                            } catch {
                                return {
                                    success: false,
                                    message: 'Git not found in PATH',
                                    details: [
                                        'Please install Git from https://git-scm.com',
                                        'Ensure git is added to your system PATH',
                                    ],
                                };
                            }
                        },
                    },
                    {
                        name: 'Git Configuration',
                        check: async () => {
                            try {
                                const { stdout: userName } = await execAsync('git config --global user.name');
                                const { stdout: userEmail } = await execAsync('git config --global user.email');

                                if (!userName.trim() || !userEmail.trim()) {
                                    return {
                                        success: false,
                                        message: 'Git user configuration missing',
                                        details: [
                                            'Run: git config --global user.name "Your Name"',
                                            'Run: git config --global user.email "your@email.com"',
                                        ],
                                    };
                                }

                                return {
                                    success: true,
                                    message: `Git configured for ${userName.trim()} <${userEmail.trim()}>`,
                                };
                            } catch {
                                return {
                                    success: false,
                                    message: 'Failed to read Git configuration',
                                };
                            }
                        },
                    },
                    {
                        name: 'Authentication',
                        check: async () => {
                            try {
                                const user = await authService.validateToken();
                                if (!user) {
                                    return {
                                        success: false,
                                        message: 'Not authenticated',
                                        details: ['Run "stint login" to authenticate'],
                                    };
                                }
                                return {
                                    success: true,
                                    message: `Authenticated as ${user.email}`,
                                };
                            } catch (error) {
                                // Check if it's a service issue vs auth issue
                                if (isServiceUnavailable(error as Error)) {
                                    const friendly = formatApiError(error as Error);
                                    return {
                                        success: false,
                                        message: friendly.message,
                                        details: [
                                            ...friendly.details,
                                            'Authentication check skipped due to connectivity issues.',
                                        ],
                                    };
                                }
                                return {
                                    success: false,
                                    message: 'Not authenticated',
                                    details: ['Run "stint login" to authenticate'],
                                };
                            }
                        },
                    },
                    {
                        name: 'API Connectivity',
                        check: async () => {
                            try {
                                await apiService.ping();
                                return {
                                    success: true,
                                    message: 'API connection successful',
                                };
                            } catch (error) {
                                const friendly = formatApiError(error as Error);
                                return {
                                    success: false,
                                    message: friendly.message,
                                    details: friendly.details,
                                };
                            }
                        },
                    },
                    {
                        name: 'WebSocket Connectivity',
                        check: async () => {
                            try {
                                await websocketService.connect();
                                const isConnected = websocketService.isConnected();
                                websocketService.disconnect(); // Clean up after test

                                if (!isConnected) {
                                    return {
                                        success: false,
                                        message: 'WebSocket connection failed',
                                        details: ['Connection established but not ready'],
                                    };
                                }

                                return {
                                    success: true,
                                    message: 'WebSocket connection successful',
                                };
                            } catch (error) {
                                const friendly = formatApiError(error as Error);
                                return {
                                    success: false,
                                    message: friendly.message,
                                    details: friendly.details,
                                };
                            }
                        },
                    },
                ];

                // Run all checks
                console.log(chalk.blue('\n🔍 Running environment diagnostics...\n'));

                for (const check of checks) {
                    spinner.text = `Checking ${check.name.toLowerCase()}...`;

                    try {
                        const result = await check.check();

                        if (result.success) {
                            console.log(`${chalk.green('✓')} ${chalk.bold(check.name)}: ${result.message}`);
                        } else {
                            hasErrors = true;
                            console.log(`${chalk.red('✖')} ${chalk.bold(check.name)}: ${result.message}`);

                            if (result.details) {
                                result.details.forEach(detail => {
                                    console.log(chalk.gray(`   ${detail}`));
                                });
                            }
                        }
                    } catch (error) {
                        hasErrors = true;
                        console.log(`${chalk.red('✖')} ${chalk.bold(check.name)}: Check failed - ${(error as Error).message}`);
                    }
                }

                spinner.stop();
                console.log();

                if (hasErrors) {
                    console.log(chalk.yellow('Some checks failed. Please address the issues above.'));
                    process.exit(1);
                } else {
                    console.log(chalk.green('All checks passed! Your environment is healthy.'));
                }

            } catch (error) {
                spinner.fail('Diagnostics failed');
                logger.error('doctor', 'Diagnostics failed', error as Error);
                console.error(chalk.red(`\n✖ Error: ${(error as Error).message}\n`));
                process.exit(1);
            }
        });
}
