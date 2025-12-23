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

// Global mock for API service
vi.mock('./api.js', () => ({
    apiService: {
        getCurrentUser: vi.fn(),
    },
}));

describe('AuthService Validation', () => {
    let authService: typeof import('./auth.js').authService;
    let config: typeof import('../utils/config.js').config;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();

        // Ensure consistent import order matching implicit dependencies
        const configModule = await import('../utils/config.js');
        // crypto is dragged in by auth but not used directly here
        await import('../utils/crypto.js');
        const authModule = await import('./auth.js');

        config = configModule.config;
        authService = authModule.authService;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('validateToken', () => {
        it('should return null if no token', async () => {
            (config.getToken as Mock).mockReturnValue(undefined);

            const user = await authService.validateToken();

            expect(user).toBeNull();
        });

        it('should validate token with API and return user', async () => {
            (config.getToken as Mock).mockReturnValue('encrypted:valid-token');

            // Setup API mock
            const { apiService } = await import('./api.js');
            (apiService.getCurrentUser as Mock).mockResolvedValue({
                id: 'user-1',
                name: 'Test User',
                email: 'test@example.com',
            });

            const user = await authService.validateToken();

            expect(user).toEqual({
                id: 'user-1',
                name: 'Test User',
                email: 'test@example.com',
            });
        });

        it('should return null if API validation fails', async () => {
            (config.getToken as Mock).mockReturnValue('encrypted:invalid-token');

            // Setup API mock failure
            const { apiService } = await import('./api.js');
            (apiService.getCurrentUser as Mock).mockRejectedValue(new Error('Invalid token'));

            const user = await authService.validateToken();

            expect(user).toBeNull();
        });
    });
});
