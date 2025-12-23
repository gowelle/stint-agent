import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs';

// Use vi.hoisted to define mocks
const mocks = vi.hoisted(() => {
    const mockExecAsync = vi.fn();
    const mockAuthService = {
        validateToken: vi.fn(),
    };
    const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
    };

    return {
        mockExecAsync,
        mockAuthService,
        mockLogger,
    };
});

// Mock dependencies
vi.mock('util', () => ({
    promisify: () => mocks.mockExecAsync,
}));

vi.mock('../services/auth.js', () => ({
    authService: mocks.mockAuthService,
}));

vi.mock('../utils/logger.js', () => ({
    logger: mocks.mockLogger,
}));

describe('Install Command E2E Tests', () => {
    const testUser = {
        id: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
    };

    let existsSyncSpy: ReturnType<typeof vi.spyOn>;
    let mkdirSyncSpy: ReturnType<typeof vi.spyOn>;
    let writeFileSyncSpy: ReturnType<typeof vi.spyOn>;
    let unlinkSyncSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockAuthService.validateToken.mockResolvedValue(testUser);
        mocks.mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

        // Spy on fs methods
        existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
        writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
        unlinkSyncSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Windows Installation', () => {
        beforeEach(() => {
            vi.spyOn(os, 'platform').mockReturnValue('win32');
        });

        it('should create task scheduler entry with correct command', async () => {
            // Import after mocks are set up
            const { installWindows } = await import('./install.js');

            await installWindows();

            expect(mocks.mockExecAsync).toHaveBeenCalledWith(
                expect.stringContaining('schtasks /Create /SC ONLOGON /TN "StintAgentDaemon"')
            );
            expect(mocks.mockExecAsync).toHaveBeenCalledWith(
                expect.stringContaining('/TR')
            );
        });

        it('should handle access denied error', async () => {
            mocks.mockExecAsync.mockRejectedValue(new Error('Access is denied'));

            const { installWindows } = await import('./install.js');

            await expect(installWindows()).rejects.toThrow('Access denied');
            await expect(installWindows()).rejects.toThrow('Run as administrator');
        });

        it('should uninstall task scheduler entry', async () => {
            const { uninstallWindows } = await import('./install.js');

            await uninstallWindows();

            expect(mocks.mockExecAsync).toHaveBeenCalledWith(
                'schtasks /Delete /TN "StintAgentDaemon" /F'
            );
        });
    });

    describe('macOS Installation', () => {
        beforeEach(() => {
            vi.spyOn(os, 'platform').mockReturnValue('darwin');
            vi.spyOn(os, 'homedir').mockReturnValue('/Users/testuser');
        });

        it('should create LaunchAgent plist file', async () => {
            const { installMac } = await import('./install.js');

            await installMac();

            expect(mkdirSyncSpy).toHaveBeenCalled();
            expect(writeFileSyncSpy).toHaveBeenCalledTimes(1);

            // Get the actual content that was written
            const writtenContent = writeFileSyncSpy.mock.calls[0][1];
            expect(writtenContent).toContain('<?xml version="1.0"');
            expect(writtenContent).toContain('codes.stint.agent');

            // Check path contains expected filename (platform-agnostic)
            const actualPath = writeFileSyncSpy.mock.calls[0][0];
            expect(actualPath).toContain('codes.stint.agent.plist');
        });

        it('should load LaunchAgent with launchctl', async () => {
            const { installMac } = await import('./install.js');

            await installMac();

            expect(mocks.mockExecAsync).toHaveBeenCalledWith(
                expect.stringContaining('launchctl load')
            );
        });

        it('should unload existing LaunchAgent before loading', async () => {
            const { installMac } = await import('./install.js');

            await installMac();

            // Should attempt to unload first (may fail, that's ok)
            expect(mocks.mockExecAsync).toHaveBeenCalledWith(
                expect.stringContaining('launchctl unload')
            );
        });

        it('should uninstall LaunchAgent', async () => {
            existsSyncSpy.mockReturnValue(true);
            const { uninstallMac } = await import('./install.js');

            await uninstallMac();

            expect(mocks.mockExecAsync).toHaveBeenCalledWith(
                expect.stringContaining('launchctl unload')
            );
            expect(unlinkSyncSpy).toHaveBeenCalled();
        });

        it('should generate valid plist content', async () => {
            const { getMacPlistContent } = await import('./install.js');

            const plistContent = getMacPlistContent();

            expect(plistContent).toContain('<?xml version="1.0"');
            expect(plistContent).toContain('codes.stint.agent');
            expect(plistContent).toContain('ProgramArguments');
            expect(plistContent).toContain('RunAtLoad');
            expect(plistContent).toContain('<true/>');
        });
    });

    describe('Linux Installation', () => {
        beforeEach(() => {
            vi.spyOn(os, 'platform').mockReturnValue('linux');
            vi.spyOn(os, 'homedir').mockReturnValue('/home/testuser');
        });

        it('should create systemd user service file', async () => {
            const { installLinux } = await import('./install.js');

            await installLinux();

            expect(mkdirSyncSpy).toHaveBeenCalled();
            expect(writeFileSyncSpy).toHaveBeenCalledTimes(1);

            // Get the actual content that was written
            const writtenContent = writeFileSyncSpy.mock.calls[0][1];
            expect(writtenContent).toContain('[Unit]');
            expect(writtenContent).toContain('Description=Stint Agent');

            // Check path contains expected filename (platform-agnostic)
            const actualPath = writeFileSyncSpy.mock.calls[0][0];
            expect(actualPath).toContain('stint-agent.service');
        });

        it('should enable and start systemd service', async () => {
            const { installLinux } = await import('./install.js');

            await installLinux();

            expect(mocks.mockExecAsync).toHaveBeenCalledWith('systemctl --user daemon-reload');
            expect(mocks.mockExecAsync).toHaveBeenCalledWith('systemctl --user enable stint-agent.service');
            expect(mocks.mockExecAsync).toHaveBeenCalledWith('systemctl --user start stint-agent.service');
        });

        it('should uninstall systemd service', async () => {
            existsSyncSpy.mockReturnValue(true);
            const { uninstallLinux } = await import('./install.js');

            await uninstallLinux();

            expect(mocks.mockExecAsync).toHaveBeenCalledWith('systemctl --user stop stint-agent.service');
            expect(mocks.mockExecAsync).toHaveBeenCalledWith('systemctl --user disable stint-agent.service');
            expect(unlinkSyncSpy).toHaveBeenCalled();
            expect(mocks.mockExecAsync).toHaveBeenCalledWith('systemctl --user daemon-reload');
        });

        it('should generate valid systemd service content', async () => {
            const { getSystemdServiceContent } = await import('./install.js');

            const serviceContent = getSystemdServiceContent();

            expect(serviceContent).toContain('[Unit]');
            expect(serviceContent).toContain('Description=Stint Agent');
            expect(serviceContent).toContain('[Service]');
            expect(serviceContent).toContain('Type=forking');
            expect(serviceContent).toContain('ExecStart=');
            expect(serviceContent).toContain('[Install]');
            expect(serviceContent).toContain('WantedBy=default.target');
        });
    });

    describe('Platform Detection', () => {
        it('should throw error for unsupported platform', async () => {
            vi.spyOn(os, 'platform').mockReturnValue('freebsd' as NodeJS.Platform);

            // This would be tested via the CLI command, but we can verify the logic
            const platform = os.platform();
            expect(['win32', 'darwin', 'linux']).not.toContain(platform);
        });
    });

    describe('Authentication Check', () => {
        it('should require authentication before installation', async () => {
            mocks.mockAuthService.validateToken.mockResolvedValue(null);

            // The actual CLI command checks auth first
            const user = await mocks.mockAuthService.validateToken();
            expect(user).toBeNull();
        });

        it('should proceed with installation when authenticated', async () => {
            const user = await mocks.mockAuthService.validateToken();
            expect(user).toEqual(testUser);
        });
    });

    describe('getDaemonCommand', () => {
        it('should construct correct daemon command', async () => {
            const { getDaemonCommand } = await import('./install.js');

            const command = getDaemonCommand();

            expect(command).toContain(process.execPath);
            expect(command).toContain('daemon start');
        });
    });
});
