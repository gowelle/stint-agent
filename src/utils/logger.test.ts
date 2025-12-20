import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import fs from 'fs';

// Mock fs module
vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn(),
        mkdirSync: vi.fn(),
        statSync: vi.fn(),
        appendFileSync: vi.fn(),
        unlinkSync: vi.fn(),
        renameSync: vi.fn(),
    },
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
    appendFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
}));

describe('Logger', () => {
    let logger: typeof import('./logger.js').logger;
    let consoleSpy: {
        log: ReturnType<typeof vi.spyOn>;
        warn: ReturnType<typeof vi.spyOn>;
        error: ReturnType<typeof vi.spyOn>;
        debug: ReturnType<typeof vi.spyOn>;
    };

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();

        // Mock fs.existsSync to return true by default
        (fs.existsSync as Mock).mockReturnValue(true);
        (fs.statSync as Mock).mockReturnValue({ size: 100 });

        // Spy on console methods
        consoleSpy = {
            log: vi.spyOn(console, 'log').mockImplementation(() => { }),
            warn: vi.spyOn(console, 'warn').mockImplementation(() => { }),
            error: vi.spyOn(console, 'error').mockImplementation(() => { }),
            debug: vi.spyOn(console, 'debug').mockImplementation(() => { }),
        };

        // Import logger fresh
        const loggerModule = await import('./logger.js');
        logger = loggerModule.logger;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.DEBUG;
    });

    describe('info', () => {
        it('should log info message to console', () => {
            logger.info('test', 'Test info message');

            expect(consoleSpy.log).toHaveBeenCalledWith(
                expect.stringContaining('[test]')
            );
            expect(consoleSpy.log).toHaveBeenCalledWith(
                expect.stringContaining('Test info message')
            );
        });

        it('should write to log file', () => {
            logger.info('api', 'API call made');

            expect(fs.appendFileSync).toHaveBeenCalled();
            const logLine = (fs.appendFileSync as Mock).mock.calls[0][1];
            expect(logLine).toContain('INFO');
            expect(logLine).toContain('[api]');
            expect(logLine).toContain('API call made');
        });
    });

    describe('warn', () => {
        it('should log warning message to console', () => {
            logger.warn('test', 'Test warning message');

            expect(consoleSpy.warn).toHaveBeenCalledWith(
                expect.stringContaining('[test]')
            );
            expect(consoleSpy.warn).toHaveBeenCalledWith(
                expect.stringContaining('Test warning message')
            );
        });

        it('should write WARN level to log file', () => {
            logger.warn('websocket', 'Connection unstable');

            expect(fs.appendFileSync).toHaveBeenCalled();
            const logLine = (fs.appendFileSync as Mock).mock.calls[0][1];
            expect(logLine).toContain('WARN');
            expect(logLine).toContain('[websocket]');
        });
    });

    describe('error', () => {
        it('should log error message to console', () => {
            logger.error('test', 'Test error message');

            expect(consoleSpy.error).toHaveBeenCalledWith(
                expect.stringContaining('[test]')
            );
            expect(consoleSpy.error).toHaveBeenCalledWith(
                expect.stringContaining('Test error message')
            );
        });

        it('should include error details when provided', () => {
            const error = new Error('Connection failed');
            logger.error('api', 'Request failed', error);

            expect(consoleSpy.error).toHaveBeenCalledWith(
                expect.stringContaining('Connection failed')
            );
        });

        it('should write to both agent.log and error.log', () => {
            logger.error('git', 'Git operation failed');

            // Should write to both logs
            expect(fs.appendFileSync).toHaveBeenCalledTimes(2);
        });

        it('should include stack trace when error has one', () => {
            const error = new Error('Stack trace test');
            logger.error('test', 'Error with stack', error);

            // Should have 3 writes: error.log (message + stack) + agent.log
            const calls = (fs.appendFileSync as Mock).mock.calls;
            const hasStackWrite = calls.some(
                (call: unknown[]) => typeof call[1] === 'string' && (call[1] as string).includes('Error:')
            );
            expect(hasStackWrite).toBe(true);
        });
    });

    describe('debug', () => {
        it('should not log when DEBUG env is not set', () => {
            delete process.env.DEBUG;
            logger.debug('test', 'Debug message');

            expect(consoleSpy.debug).not.toHaveBeenCalled();
        });

        it('should log when DEBUG env is set', async () => {
            process.env.DEBUG = 'true';

            // Re-import to pick up env change
            vi.resetModules();
            const loggerModule = await import('./logger.js');

            // Re-spy on console.debug
            const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => { });

            loggerModule.logger.debug('test', 'Debug message');

            expect(debugSpy).toHaveBeenCalledWith(
                expect.stringContaining('Debug message')
            );
        });
    });

    describe('success', () => {
        it('should log success message to console', () => {
            logger.success('test', 'Operation completed');

            expect(consoleSpy.log).toHaveBeenCalledWith(
                expect.stringContaining('Operation completed')
            );
        });

        it('should write INFO level to log file', () => {
            logger.success('commit', 'Commit created');

            expect(fs.appendFileSync).toHaveBeenCalled();
            const logLine = (fs.appendFileSync as Mock).mock.calls[0][1];
            expect(logLine).toContain('INFO');
            expect(logLine).toContain('[commit]');
        });
    });

    describe('log directory creation', () => {
        it('should create log directory if it does not exist', () => {
            (fs.existsSync as Mock).mockReturnValue(false);

            logger.info('test', 'First log');

            expect(fs.mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining('stint'),
                { recursive: true }
            );
        });
    });

    describe('log rotation', () => {
        it('should rotate log when file exceeds max size', () => {
            // First check returns true (file exists), stat returns large size
            (fs.existsSync as Mock).mockReturnValue(true);
            (fs.statSync as Mock).mockReturnValue({ size: 11 * 1024 * 1024 }); // 11MB

            logger.info('test', 'Trigger rotation');

            expect(fs.renameSync).toHaveBeenCalled();
        });

        it('should not rotate log when file is under max size', () => {
            (fs.existsSync as Mock).mockReturnValue(true);
            (fs.statSync as Mock).mockReturnValue({ size: 100 }); // Small file

            logger.info('test', 'No rotation needed');

            expect(fs.renameSync).not.toHaveBeenCalled();
        });
    });
});
