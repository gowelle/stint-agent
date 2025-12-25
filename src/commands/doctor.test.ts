import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Use vi.hoisted for proper mock hoisting
const { mockExecAsync, mockAuthService, mockApiService, mockWebsocketService, mockProcessExit } = vi.hoisted(() => ({
    mockExecAsync: vi.fn(),
    mockAuthService: {
        validateToken: vi.fn(),
    },
    mockApiService: {
        ping: vi.fn(),
    },
    mockWebsocketService: {
        connect: vi.fn(),
        isConnected: vi.fn(),
        disconnect: vi.fn(),
    },
    mockProcessExit: vi.fn(),
}));

// Mock dependencies
vi.mock('child_process', () => ({
    exec: vi.fn(),
}));

vi.mock('util', () => ({
    promisify: () => mockExecAsync,
}));

vi.mock('../services/auth.js', () => ({
    authService: mockAuthService,
}));

vi.mock('../services/api.js', () => ({
    apiService: mockApiService,
}));

vi.mock('../services/websocket.js', () => ({
    websocketService: mockWebsocketService,
}));

vi.mock('../utils/logger.js', () => ({
    logger: {
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('ora', () => ({
    default: () => ({
        start: vi.fn().mockReturnThis(),
        stop: vi.fn(),
        fail: vi.fn(),
        text: '',
    }),
}));

vi.mock('chalk', () => ({
    default: {
        blue: (s: string) => s,
        green: (s: string) => s,
        red: (s: string) => s,
        yellow: (s: string) => s,
        gray: (s: string) => s,
        bold: (s: string) => s,
    },
}));

// Import after mocks
import { registerDoctorCommand } from './doctor.js';

describe('Doctor Command', () => {
    let program: Command;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let originalProcessExit: typeof process.exit;

    beforeEach(() => {
        vi.clearAllMocks();
        program = new Command();
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Mock process.exit to prevent test from exiting
        originalProcessExit = process.exit;
        process.exit = mockProcessExit as unknown as typeof process.exit;
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        process.exit = originalProcessExit;
    });

    describe('registerDoctorCommand', () => {
        it('should register the doctor command', () => {
            registerDoctorCommand(program);
            const doctorCmd = program.commands.find(cmd => cmd.name() === 'doctor');
            expect(doctorCmd).toBeDefined();
            expect(doctorCmd?.description()).toBe('Run diagnostics to check environment health');
        });
    });

    describe('Health Checks - All Passing', () => {
        beforeEach(() => {
            // Setup all checks to pass
            mockExecAsync.mockImplementation((cmd: string) => {
                if (cmd === 'git --version') {
                    return Promise.resolve({ stdout: 'git version 2.40.0' });
                }
                if (cmd === 'git config --global user.name') {
                    return Promise.resolve({ stdout: 'Test User' });
                }
                if (cmd === 'git config --global user.email') {
                    return Promise.resolve({ stdout: 'test@example.com' });
                }
                return Promise.reject(new Error('Unknown command'));
            });
            mockAuthService.validateToken.mockResolvedValue({ email: 'user@example.com' });
            mockApiService.ping.mockResolvedValue(undefined);
            mockWebsocketService.connect.mockResolvedValue(undefined);
            mockWebsocketService.isConnected.mockReturnValue(true);
        });

        it('should pass all health checks when everything is configured', async () => {
            registerDoctorCommand(program);
            await program.parseAsync(['node', 'test', 'doctor']);

            // Verify all checks passed
            expect(mockExecAsync).toHaveBeenCalledWith('git --version');
            expect(mockExecAsync).toHaveBeenCalledWith('git config --global user.name');
            expect(mockExecAsync).toHaveBeenCalledWith('git config --global user.email');
            expect(mockAuthService.validateToken).toHaveBeenCalled();
            expect(mockApiService.ping).toHaveBeenCalled();
            expect(mockWebsocketService.connect).toHaveBeenCalled();
            expect(mockWebsocketService.disconnect).toHaveBeenCalled();

            // Should not exit with error
            expect(mockProcessExit).not.toHaveBeenCalled();
        });
    });

    describe('Git Installation Check', () => {
        beforeEach(() => {
            // Default: other checks pass
            mockAuthService.validateToken.mockResolvedValue({ email: 'user@example.com' });
            mockApiService.ping.mockResolvedValue(undefined);
            mockWebsocketService.connect.mockResolvedValue(undefined);
            mockWebsocketService.isConnected.mockReturnValue(true);
        });

        it('should pass when git is installed', async () => {
            mockExecAsync.mockImplementation((cmd: string) => {
                if (cmd === 'git --version') {
                    return Promise.resolve({ stdout: 'git version 2.40.0' });
                }
                if (cmd.includes('user.name')) {
                    return Promise.resolve({ stdout: 'Test User' });
                }
                if (cmd.includes('user.email')) {
                    return Promise.resolve({ stdout: 'test@example.com' });
                }
                return Promise.reject(new Error('Unknown'));
            });

            registerDoctorCommand(program);
            await program.parseAsync(['node', 'test', 'doctor']);

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Git Installation'));
            expect(mockProcessExit).not.toHaveBeenCalled();
        });

        it('should fail when git is not installed', async () => {
            mockExecAsync.mockImplementation((cmd: string) => {
                if (cmd === 'git --version') {
                    return Promise.reject(new Error('git not found'));
                }
                // Other git commands will also fail
                return Promise.reject(new Error('git not found'));
            });

            registerDoctorCommand(program);
            await program.parseAsync(['node', 'test', 'doctor']);

            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });
    });

    describe('Git Configuration Check', () => {
        beforeEach(() => {
            mockAuthService.validateToken.mockResolvedValue({ email: 'user@example.com' });
            mockApiService.ping.mockResolvedValue(undefined);
            mockWebsocketService.connect.mockResolvedValue(undefined);
            mockWebsocketService.isConnected.mockReturnValue(true);
        });

        it('should fail when git user.name is not configured', async () => {
            mockExecAsync.mockImplementation((cmd: string) => {
                if (cmd === 'git --version') {
                    return Promise.resolve({ stdout: 'git version 2.40.0' });
                }
                if (cmd.includes('user.name')) {
                    return Promise.resolve({ stdout: '' }); // Empty name
                }
                if (cmd.includes('user.email')) {
                    return Promise.resolve({ stdout: 'test@example.com' });
                }
                return Promise.reject(new Error('Unknown'));
            });

            registerDoctorCommand(program);
            await program.parseAsync(['node', 'test', 'doctor']);

            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });

        it('should fail when git user.email is not configured', async () => {
            mockExecAsync.mockImplementation((cmd: string) => {
                if (cmd === 'git --version') {
                    return Promise.resolve({ stdout: 'git version 2.40.0' });
                }
                if (cmd.includes('user.name')) {
                    return Promise.resolve({ stdout: 'Test User' });
                }
                if (cmd.includes('user.email')) {
                    return Promise.resolve({ stdout: '' }); // Empty email
                }
                return Promise.reject(new Error('Unknown'));
            });

            registerDoctorCommand(program);
            await program.parseAsync(['node', 'test', 'doctor']);

            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });
    });

    describe('Authentication Check', () => {
        beforeEach(() => {
            mockExecAsync.mockImplementation((cmd: string) => {
                if (cmd === 'git --version') {
                    return Promise.resolve({ stdout: 'git version 2.40.0' });
                }
                if (cmd.includes('user.name')) {
                    return Promise.resolve({ stdout: 'Test User' });
                }
                if (cmd.includes('user.email')) {
                    return Promise.resolve({ stdout: 'test@example.com' });
                }
                return Promise.reject(new Error('Unknown'));
            });
            mockApiService.ping.mockResolvedValue(undefined);
            mockWebsocketService.connect.mockResolvedValue(undefined);
            mockWebsocketService.isConnected.mockReturnValue(true);
        });

        it('should pass when user is authenticated', async () => {
            mockAuthService.validateToken.mockResolvedValue({ email: 'user@example.com' });

            registerDoctorCommand(program);
            await program.parseAsync(['node', 'test', 'doctor']);

            expect(mockProcessExit).not.toHaveBeenCalled();
        });

        it('should fail when user is not authenticated', async () => {
            mockAuthService.validateToken.mockResolvedValue(null);

            registerDoctorCommand(program);
            await program.parseAsync(['node', 'test', 'doctor']);

            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });

        it('should fail when authentication validation throws', async () => {
            mockAuthService.validateToken.mockRejectedValue(new Error('Token expired'));

            registerDoctorCommand(program);
            await program.parseAsync(['node', 'test', 'doctor']);

            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });
    });

    describe('API Connectivity Check', () => {
        beforeEach(() => {
            mockExecAsync.mockImplementation((cmd: string) => {
                if (cmd === 'git --version') {
                    return Promise.resolve({ stdout: 'git version 2.40.0' });
                }
                if (cmd.includes('user.name')) {
                    return Promise.resolve({ stdout: 'Test User' });
                }
                if (cmd.includes('user.email')) {
                    return Promise.resolve({ stdout: 'test@example.com' });
                }
                return Promise.reject(new Error('Unknown'));
            });
            mockAuthService.validateToken.mockResolvedValue({ email: 'user@example.com' });
            mockWebsocketService.connect.mockResolvedValue(undefined);
            mockWebsocketService.isConnected.mockReturnValue(true);
        });

        it('should pass when API is reachable', async () => {
            mockApiService.ping.mockResolvedValue(undefined);

            registerDoctorCommand(program);
            await program.parseAsync(['node', 'test', 'doctor']);

            expect(mockProcessExit).not.toHaveBeenCalled();
        });

        it('should fail when API is not reachable', async () => {
            mockApiService.ping.mockRejectedValue(new Error('Connection refused'));

            registerDoctorCommand(program);
            await program.parseAsync(['node', 'test', 'doctor']);

            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });
    });

    describe('WebSocket Connectivity Check', () => {
        beforeEach(() => {
            mockExecAsync.mockImplementation((cmd: string) => {
                if (cmd === 'git --version') {
                    return Promise.resolve({ stdout: 'git version 2.40.0' });
                }
                if (cmd.includes('user.name')) {
                    return Promise.resolve({ stdout: 'Test User' });
                }
                if (cmd.includes('user.email')) {
                    return Promise.resolve({ stdout: 'test@example.com' });
                }
                return Promise.reject(new Error('Unknown'));
            });
            mockAuthService.validateToken.mockResolvedValue({ email: 'user@example.com' });
            mockApiService.ping.mockResolvedValue(undefined);
        });

        it('should pass when WebSocket connects successfully', async () => {
            mockWebsocketService.connect.mockResolvedValue(undefined);
            mockWebsocketService.isConnected.mockReturnValue(true);

            registerDoctorCommand(program);
            await program.parseAsync(['node', 'test', 'doctor']);

            expect(mockWebsocketService.disconnect).toHaveBeenCalled();
            expect(mockProcessExit).not.toHaveBeenCalled();
        });

        it('should fail when WebSocket connection fails', async () => {
            mockWebsocketService.connect.mockRejectedValue(new Error('WebSocket error'));

            registerDoctorCommand(program);
            await program.parseAsync(['node', 'test', 'doctor']);

            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });

        it('should fail when WebSocket connects but is not ready', async () => {
            mockWebsocketService.connect.mockResolvedValue(undefined);
            mockWebsocketService.isConnected.mockReturnValue(false);

            registerDoctorCommand(program);
            await program.parseAsync(['node', 'test', 'doctor']);

            expect(mockWebsocketService.disconnect).toHaveBeenCalled();
            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });
    });
});
