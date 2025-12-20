import { describe, it, expect, vi, Mock } from 'vitest';

/**
 * WebSocket Service Tests
 * 
 * Note: Due to the complexity of mocking WebSocket connections with vitest's module
 * isolation, these tests focus on the synchronous aspects of the WebSocketService.
 * Integration tests with real WebSocket connections should be done separately.
 */

// Mock dependencies
vi.mock('../utils/config.js', () => ({
    config: {
        getWsUrl: vi.fn(() => 'wss://test.stint.app/app/test-key'),
    },
}));

vi.mock('./auth.js', () => ({
    authService: {
        getToken: vi.fn(),
    },
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

// Mock ws module with a simple implementation
vi.mock('ws', () => {
    const OPEN = 1;
    const CLOSED = 3;

    // Create a simple mock that tracks constructor calls
    const MockWS = vi.fn();
    MockWS.prototype.on = vi.fn();
    MockWS.prototype.send = vi.fn();
    MockWS.prototype.close = vi.fn();

    // Static properties
    (MockWS as unknown as { OPEN: number; CLOSED: number }).OPEN = OPEN;
    (MockWS as unknown as { OPEN: number; CLOSED: number }).CLOSED = CLOSED;

    return {
        default: MockWS,
        WebSocket: MockWS,
    };
});

describe('WebSocketService', () => {
    describe('connection initialization', () => {
        it('should throw error if no token available', async () => {
            const authModule = await import('./auth.js');
            (authModule.authService.getToken as Mock).mockResolvedValue(null);

            vi.resetModules();
            const wsModule = await import('./websocket.js');

            await expect(wsModule.websocketService.connect()).rejects.toThrow(
                'No authentication token available'
            );
        });

        it('should attempt to create WebSocket connection with token', async () => {
            // Fresh imports
            vi.resetModules();

            const authModule = await import('./auth.js');
            (authModule.authService.getToken as Mock).mockResolvedValue('my-test-token');

            const wsModule = await import('./websocket.js');
            const WebSocket = (await import('ws')).default;

            // Start connection (it will hang waiting for 'open' event)
            const connectPromise = wsModule.websocketService.connect();

            // Give it a moment to initialize
            await new Promise((r) => setTimeout(r, 50));

            // Verify WebSocket was constructed
            expect(WebSocket).toHaveBeenCalled();
            const constructorCall = (WebSocket as Mock).mock.calls[0];
            expect(constructorCall[0]).toContain('token=my-test-token');

            // Clean up by disconnecting
            wsModule.websocketService.disconnect();

            // The promise may reject or hang, we just want to verify the WebSocket was created correctly
            try {
                await Promise.race([
                    connectPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 100))
                ]);
            } catch {
                // Expected - either error handler or timeout
            }
        });
    });

    describe('isConnected', () => {
        it('should return false when no connection exists', async () => {
            vi.resetModules();
            const wsModule = await import('./websocket.js');

            expect(wsModule.websocketService.isConnected()).toBe(false);
        });
    });

    describe('disconnect', () => {
        it('should not throw when called without connection', async () => {
            vi.resetModules();
            const wsModule = await import('./websocket.js');

            expect(() => wsModule.websocketService.disconnect()).not.toThrow();
        });
    });

    describe('event handler registration', () => {
        it('should accept commit approved handler', async () => {
            vi.resetModules();
            const wsModule = await import('./websocket.js');
            const handler = vi.fn();

            expect(() => wsModule.websocketService.onCommitApproved(handler)).not.toThrow();
        });

        it('should accept project updated handler', async () => {
            vi.resetModules();
            const wsModule = await import('./websocket.js');
            const handler = vi.fn();

            expect(() => wsModule.websocketService.onProjectUpdated(handler)).not.toThrow();
        });

        it('should accept disconnect handler', async () => {
            vi.resetModules();
            const wsModule = await import('./websocket.js');
            const handler = vi.fn();

            expect(() => wsModule.websocketService.onDisconnect(handler)).not.toThrow();
        });
    });

    describe('subscribeToUserChannel', () => {
        it('should not throw when called without connection', async () => {
            vi.resetModules();
            const wsModule = await import('./websocket.js');

            expect(() => wsModule.websocketService.subscribeToUserChannel('user-123')).not.toThrow();
        });
    });
});
