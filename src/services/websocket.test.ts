import { describe, it, expect, vi, Mock, beforeEach, afterEach } from 'vitest';

// Connection handlers storage - these need to be module-scoped for the mock factories
const connectionHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};
const channelHandlers: Record<string, Record<string, (...args: unknown[]) => void>> = {};
let connectionState = 'initialized';

// Track echo instance for assertions
let currentEchoInstance: {
    private: Mock;
    leave: Mock;
    disconnect: Mock;
} | null = null;

// Mock the laravel-echo module - these need to be self-contained
vi.mock('laravel-echo', () => {
    return {
        default: class MockEcho {
            connector = {
                pusher: {
                    connection: {
                        get state() { return connectionState; },
                        bind: (event: string, handler: (...args: unknown[]) => void) => {
                            if (!connectionHandlers[event]) {
                                connectionHandlers[event] = [];
                            }
                            connectionHandlers[event].push(handler);
                        },
                    },
                },
            };
            private = vi.fn((channel: string) => {
                channelHandlers[channel] = {};
                return {
                    listen: vi.fn(function (this: { listen: Mock }, event: string, handler: (...args: unknown[]) => void) {
                        channelHandlers[channel][event] = handler;
                        return this;
                    }),
                };
            });
            leave = vi.fn();
            disconnect = vi.fn();

            constructor() {
                currentEchoInstance = {
                    private: this.private,
                    leave: this.leave,
                    disconnect: this.disconnect,
                };
            }
        },
    };
});

// Mock pusher-js - just needs to be a valid constructor
vi.mock('pusher-js', () => {
    return {
        default: class MockPusher {
            connection = { state: 'initialized' };
        },
    };
});

// Mock dependencies - return mock functions that we can control
const mockGetApiUrl = vi.fn(() => 'https://test.stint.app');
const mockGetReverbAppKey = vi.fn(() => 'test-reverb-key');
const mockGetEnvironment = vi.fn(() => 'production');
const mockGetToken = vi.fn();

vi.mock('../utils/config.js', () => ({
    config: {
        getApiUrl: mockGetApiUrl,
        getReverbAppKey: mockGetReverbAppKey,
        getEnvironment: mockGetEnvironment,
    },
}));

vi.mock('./auth.js', () => ({
    authService: {
        getToken: mockGetToken,
    },
}));

const mockLoggerInfo = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();
const mockLoggerDebug = vi.fn();
const mockLoggerSuccess = vi.fn();

vi.mock('../utils/logger.js', () => ({
    logger: {
        info: mockLoggerInfo,
        warn: mockLoggerWarn,
        error: mockLoggerError,
        debug: mockLoggerDebug,
        success: mockLoggerSuccess,
    },
}));

// Helper to reset all state
function resetState() {
    Object.keys(connectionHandlers).forEach(k => delete connectionHandlers[k]);
    Object.keys(channelHandlers).forEach(k => delete channelHandlers[k]);
    connectionState = 'initialized';
    currentEchoInstance = null;

    // Reset mock return values to defaults
    mockGetApiUrl.mockReturnValue('https://test.stint.app');
    mockGetReverbAppKey.mockReturnValue('test-reverb-key');
    mockGetEnvironment.mockReturnValue('production');
    mockGetToken.mockReset();
}

// Helper to simulate connection
function simulateConnected() {
    connectionState = 'connected';
    if (connectionHandlers['connected']) {
        connectionHandlers['connected'].forEach(h => h());
    }
}

// Helper to trigger channel events
function triggerChannelEvent(channel: string, event: string, payload: unknown) {
    const handler = channelHandlers[channel]?.[event];
    if (handler) {
        handler(payload);
    }
}

describe('WebSocketService', () => {
    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        resetState();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('connection', () => {
        it('should successfully connect and handle connected event', async () => {
            mockGetToken.mockResolvedValue('test-token');

            const wsModule = await import('./websocket.js');
            const connectPromise = wsModule.websocketService.connect();

            // Wait for Echo initialization
            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate 'connected' event
            simulateConnected();

            await expect(connectPromise).resolves.toBeUndefined();
            expect(wsModule.websocketService.isConnected()).toBe(true);
        });

        it('should handle connection failure', async () => {
            mockGetToken.mockResolvedValue('test-token');

            const wsModule = await import('./websocket.js');
            const connectPromise = wsModule.websocketService.connect();

            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate 'failed' event
            if (connectionHandlers['failed']) {
                connectionHandlers['failed'].forEach(h => h());
            }

            await expect(connectPromise).rejects.toThrow('WebSocket connection failed');
        });

        it('should throw error if no token available', async () => {
            mockGetToken.mockResolvedValue(null);

            const wsModule = await import('./websocket.js');
            await expect(wsModule.websocketService.connect()).rejects.toThrow('No authentication token available');
        });

        it('should throw error if reverb key not configured', async () => {
            mockGetToken.mockResolvedValue('test-token');
            mockGetReverbAppKey.mockReturnValue(undefined);

            const wsModule = await import('./websocket.js');
            await expect(wsModule.websocketService.connect()).rejects.toThrow('Reverb app key not configured');
        });
    });

    describe('message handling', () => {
        const setupConnection = async () => {
            mockGetToken.mockResolvedValue('test-token');

            const wsModule = await import('./websocket.js');
            const connectPromise = wsModule.websocketService.connect();
            await new Promise(resolve => setTimeout(resolve, 10));
            simulateConnected();
            await connectPromise;
            return wsModule;
        };

        it('should handle commit.approved event', async () => {
            const wsModule = await setupConnection();
            const handler = vi.fn();
            wsModule.websocketService.onCommitApproved(handler);

            await wsModule.websocketService.subscribeToUserChannel('user-123');

            // Simulate event from Laravel
            const payload = { pendingCommit: { id: '123', project: { id: 'prj_1' } } };
            triggerChannelEvent('user.user-123', '.commit.approved', payload);

            expect(handler).toHaveBeenCalledWith(payload.pendingCommit, payload.pendingCommit.project);
        });

        it('should handle commit.pending event', async () => {
            const wsModule = await setupConnection();
            const handler = vi.fn();
            wsModule.websocketService.onCommitPending(handler);

            await wsModule.websocketService.subscribeToUserChannel('user-123');

            const payload = { pendingCommit: { id: '456' } };
            triggerChannelEvent('user.user-123', '.commit.pending', payload);

            expect(handler).toHaveBeenCalledWith(payload.pendingCommit);
        });

        it('should handle suggestion.created event', async () => {
            const wsModule = await setupConnection();
            const handler = vi.fn();
            wsModule.websocketService.onSuggestionCreated(handler);

            await wsModule.websocketService.subscribeToUserChannel('user-123');

            const payload = { suggestion: { id: 'sugg_1' } };
            triggerChannelEvent('user.user-123', '.suggestion.created', payload);

            expect(handler).toHaveBeenCalledWith(payload.suggestion);
        });

        it('should handle project.updated event', async () => {
            const wsModule = await setupConnection();
            const handler = vi.fn();
            wsModule.websocketService.onProjectUpdated(handler);

            await wsModule.websocketService.subscribeToUserChannel('user-123');

            const payload = { project: { id: 'prj_updated' } };
            triggerChannelEvent('user.user-123', '.project.updated', payload);

            expect(handler).toHaveBeenCalledWith(payload.project);
        });

        it('should handle sync.requested event', async () => {
            const wsModule = await setupConnection();
            const handler = vi.fn();
            wsModule.websocketService.onSyncRequested(handler);

            await wsModule.websocketService.subscribeToUserChannel('user-123');

            const payload = { project: { id: 'prj_sync' } };
            triggerChannelEvent('user.user-123', '.sync.requested', payload);

            expect(handler).toHaveBeenCalledWith('prj_sync');
        });

        it('should handle agent.disconnected event', async () => {
            const wsModule = await setupConnection();
            const handler = vi.fn();
            wsModule.websocketService.onAgentDisconnected(handler);

            await wsModule.websocketService.subscribeToUserChannel('user-123');

            const payload = { reason: 'Too many connections' };
            triggerChannelEvent('user.user-123', '.agent.disconnected', payload);

            expect(handler).toHaveBeenCalledWith('Too many connections');
        });

        it('should handle agent.disconnected event with default reason', async () => {
            const wsModule = await setupConnection();
            const handler = vi.fn();
            wsModule.websocketService.onAgentDisconnected(handler);

            await wsModule.websocketService.subscribeToUserChannel('user-123');

            const payload = {};
            triggerChannelEvent('user.user-123', '.agent.disconnected', payload);

            expect(handler).toHaveBeenCalledWith('Server requested disconnect');
        });
    });

    describe('subscription and disconnect', () => {
        const setupConnection = async () => {
            mockGetToken.mockResolvedValue('test-token');

            const wsModule = await import('./websocket.js');
            const connectPromise = wsModule.websocketService.connect();
            await new Promise(resolve => setTimeout(resolve, 10));
            simulateConnected();
            await connectPromise;
            return wsModule;
        };

        it('should subscribe to user private channel', async () => {
            const wsModule = await setupConnection();

            await wsModule.websocketService.subscribeToUserChannel('user-123');

            expect(currentEchoInstance?.private).toHaveBeenCalledWith('user.user-123');
        });

        it('should not subscribe if not connected', async () => {
            const wsModule = await import('./websocket.js');

            await wsModule.websocketService.subscribeToUserChannel('user-123');

            expect(mockLoggerWarn).toHaveBeenCalledWith('websocket', 'Cannot subscribe: not connected');
        });

        it('should disconnect and leave channel', async () => {
            const wsModule = await setupConnection();

            await wsModule.websocketService.subscribeToUserChannel('user-123');
            wsModule.websocketService.disconnect();

            expect(currentEchoInstance?.leave).toHaveBeenCalledWith('user.user-123');
            expect(currentEchoInstance?.disconnect).toHaveBeenCalled();
        });

        it('should handle onDisconnect handler', async () => {
            const wsModule = await setupConnection();
            const handler = vi.fn();
            wsModule.websocketService.onDisconnect(handler);

            // Simulate disconnection event
            if (connectionHandlers['disconnected']) {
                connectionHandlers['disconnected'].forEach(h => h());
            }

            expect(handler).toHaveBeenCalled();
        });
    });
});
