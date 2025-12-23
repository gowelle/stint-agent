import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';

// Mock dependencies
vi.mock('../utils/config.js', () => ({
    config: {
        getToken: vi.fn(),
        setToken: vi.fn(),
        clearToken: vi.fn(),
        getMachineId: vi.fn(() => 'test-machine-id'),
        getMachineName: vi.fn(() => 'test-machine'),
    },
}));

vi.mock('../utils/crypto.js', () => ({
    encrypt: vi.fn((text: string) => `encrypted:${text}`),
    decrypt: vi.fn((text: string) => text.replace('encrypted:', '')),
}));

vi.mock('../utils/logger.js', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
    },
}));

describe('AuthService Core', () => {
    let authService: typeof import('./auth.js').authService;
    let config: typeof import('../utils/config.js').config;
    let crypto: typeof import('../utils/crypto.js');

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();

        const configModule = await import('../utils/config.js');
        const cryptoModule = await import('../utils/crypto.js');
        const authModule = await import('./auth.js');

        config = configModule.config;
        crypto = cryptoModule;
        authService = authModule.authService;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('saveToken', () => {
        it('should encrypt and save token', async () => {
            await authService.saveToken('my-secret-token');

            expect(crypto.encrypt).toHaveBeenCalledWith('my-secret-token');
            expect(config.setToken).toHaveBeenCalledWith('encrypted:my-secret-token');
        });

        it('should throw error if encryption fails', async () => {
            (crypto.encrypt as Mock).mockImplementation(() => {
                throw new Error('Encryption failed');
            });

            await expect(authService.saveToken('token')).rejects.toThrow('Encryption failed');
        });
    });

    describe('getToken', () => {
        it('should return decrypted token', async () => {
            (config.getToken as Mock).mockReturnValue('encrypted:my-secret-token');

            const token = await authService.getToken();

            expect(crypto.decrypt).toHaveBeenCalledWith('encrypted:my-secret-token');
            expect(token).toBe('my-secret-token');
        });

        it('should return null if no token stored', async () => {
            (config.getToken as Mock).mockReturnValue(undefined);

            const token = await authService.getToken();

            expect(token).toBeNull();
        });

        it('should return null if decryption fails', async () => {
            (config.getToken as Mock).mockReturnValue('encrypted:token');
            (crypto.decrypt as Mock).mockImplementation(() => {
                throw new Error('Decryption failed');
            });

            const token = await authService.getToken();

            expect(token).toBeNull();
        });
    });

    describe('clearToken', () => {
        it('should clear token from config', async () => {
            await authService.clearToken();

            expect(config.clearToken).toHaveBeenCalled();
        });
    });

    describe('getMachineId', () => {
        it('should return machine id from config', () => {
            const machineId = authService.getMachineId();

            expect(config.getMachineId).toHaveBeenCalled();
            expect(machineId).toBe('test-machine-id');
        });
    });

    describe('getMachineName', () => {
        it('should return machine name from config', () => {
            const machineName = authService.getMachineName();

            expect(config.getMachineName).toHaveBeenCalled();
            expect(machineName).toBe('test-machine');
        });
    });
});
