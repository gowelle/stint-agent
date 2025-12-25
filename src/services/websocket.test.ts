import { describe, it, expect, vi, Mock, beforeEach, afterEach } from 'vitest';

// Define the mock implementation outside the mock factory so we can reference it
const mockOn = vi.fn();
const mockSend = vi.fn();
const mockClose = vi.fn();
const mockTerminate = vi.fn();

// Create a map to store event handlers so we can trigger them in tests
let eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

// Mock the ws module
vi.mock('ws', () => {
    return {
        default: class MockWebSocket {
            static OPEN = 1;
            static CLOSED = 3;
            readyState = 1;

            constructor(_url: string) {
                // reset handlers on new connection
                // but keep the reference strictly for verification if needed
            }

            on(event: string, handler: (...args: unknown[]) => void) {
                if (!eventHandlers[event]) {
                    eventHandlers[event] = [];
                }
                eventHandlers[event].push(handler);
                mockOn(event, handler);
            }

            send(data: unknown) {
                mockSend(data);
            }

            close() {
                this.readyState = 3; // CLOSED
                mockClose();
                // Trigger close event
                if (eventHandlers['close']) {
                    eventHandlers['close'].forEach(h => h());
                }
            }

            terminate() {
                mockTerminate();
            }
        },
        WebSocket: class MockWebSocket {
            static OPEN = 1;
            static CLOSED = 3;
        }
    };
});

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

describe('WebSocketService', () => {
    let wsModule: typeof import('ws');

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        eventHandlers = {}; // Reset event handlers
        wsModule = await import('./websocket.js');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('connection', () => {
        it('should successfully connect and handle open event', async () => {
            const authModule = await import('./auth.js');
            (authModule.authService.getToken as Mock).mockResolvedValue('test-token');

            const connectPromise = wsModule.websocketService.connect();

            // Simulate 'open' event
            // We need to wait a tick for the constructor code to run and register handlers
            await new Promise(resolve => setTimeout(resolve, 0));

            if (eventHandlers['open']) {
                eventHandlers['open'].forEach(h => h());
            }

            await expect(connectPromise).resolves.toBeUndefined();
            expect(wsModule.websocketService.isConnected()).toBe(true);
        });

        it('should handle connection failure', async () => {
            const authModule = await import('./auth.js');
            (authModule.authService.getToken as Mock).mockResolvedValue('test-token');

            const connectPromise = wsModule.websocketService.connect();

            await new Promise(resolve => setTimeout(resolve, 0));

            const error = new Error('Connection failed');
            if (eventHandlers['error']) {
                eventHandlers['error'].forEach(h => h(error));
            }

            await expect(connectPromise).rejects.toThrow('Connection failed');
        });

        it('should throw error if no token available', async () => {
            const authModule = await import('./auth.js');
            (authModule.authService.getToken as Mock).mockResolvedValue(null);

            await expect(wsModule.websocketService.connect()).rejects.toThrow('No authentication token available');
        });
    });

    describe('message handling', () => {
        beforeEach(async () => {
            const authModule = await import('./auth.js');
            (authModule.authService.getToken as Mock).mockResolvedValue('test-token');
            const connectPromise = wsModule.websocketService.connect();
            await new Promise(resolve => setTimeout(resolve, 0));
            if (eventHandlers['open']) eventHandlers['open'].forEach(h => h());
            await connectPromise;
        });

        const simulateMessage = (data: unknown) => {
            if (eventHandlers['message']) {
                eventHandlers['message'].forEach(h => h(Buffer.from(JSON.stringify(data))));
            }
        };

        it('should handle pusher:connection_established', async () => {
            const loggerModule = await import('../utils/logger.js');
            simulateMessage({ event: 'pusher:connection_established' });
            expect(loggerModule.logger.success).toHaveBeenCalledWith('websocket', 'Connection established');
        });

        it('should handle commit.approved event', () => {
            const handler = vi.fn();
            wsModule.websocketService.onCommitApproved(handler);

            // Laravel sends { pendingCommit } with project relationship loaded
            const payload = {
                event: 'commit.approved',
                data: {
                    pendingCommit: { id: '123', project: { id: 'prj_1' } }
                }
            };
            simulateMessage(payload);

            expect(handler).toHaveBeenCalledWith(payload.data.pendingCommit, payload.data.pendingCommit.project);
        });

        it('should handle commit.pending event', () => {
            const handler = vi.fn();
            wsModule.websocketService.onCommitPending(handler);

            const payload = {
                event: 'commit.pending',
                data: {
                    pendingCommit: { id: '456' }
                }
            };
            simulateMessage(payload);

            expect(handler).toHaveBeenCalledWith(payload.data.pendingCommit);
        });

        it('should handle suggestion.created event', () => {
            const handler = vi.fn();
            wsModule.websocketService.onSuggestionCreated(handler);

            const payload = {
                event: 'suggestion.created',
                data: {
                    suggestion: { id: 'sugg_1' }
                }
            };
            simulateMessage(payload);

            expect(handler).toHaveBeenCalledWith(payload.data.suggestion);
        });

        it('should handle project.updated event', () => {
            const handler = vi.fn();
            wsModule.websocketService.onProjectUpdated(handler);

            const payload = {
                event: 'project.updated',
                data: {
                    project: { id: 'prj_updated' }
                }
            };
            simulateMessage(payload);

            expect(handler).toHaveBeenCalledWith(payload.data.project);
        });

        it('should handle sync.requested event', () => {
            const handler = vi.fn();
            wsModule.websocketService.onSyncRequested(handler);

            // Laravel sends { project } - handler extracts project.id
            const payload = {
                event: 'sync.requested',
                data: {
                    project: { id: 'prj_sync' }
                }
            };
            simulateMessage(payload);

            expect(handler).toHaveBeenCalledWith('prj_sync');
        });

        it('should handle agent.disconnected event', () => {
            const handler = vi.fn();
            wsModule.websocketService.onAgentDisconnected(handler);

            const payload = {
                event: 'agent.disconnected',
                data: {
                    reason: 'Too many connections'
                }
            };
            simulateMessage(payload);

            expect(handler).toHaveBeenCalledWith('Too many connections');
        });

        it('should handle agent.disconnected event with default reason', () => {
            const handler = vi.fn();
            wsModule.websocketService.onAgentDisconnected(handler);

            const payload = {
                event: 'agent.disconnected',
                data: {}
            };
            simulateMessage(payload);

            expect(handler).toHaveBeenCalledWith('Server requested disconnect');
        });

        it('should log error on invalid message format', async () => {
            const loggerModule = await import('../utils/logger.js');
            if (eventHandlers['message']) {
                eventHandlers['message'].forEach(h => h(Buffer.from('invalid-json')));
            }
            expect(loggerModule.logger.error).toHaveBeenCalledWith('websocket', 'Failed to parse message', expect.any(Error));
        });
    });

    describe('subscription and disconnect', () => {
        beforeEach(async () => {
            const authModule = await import('./auth.js');
            (authModule.authService.getToken as Mock).mockResolvedValue('test-token');
            const connectPromise = wsModule.websocketService.connect();
            await new Promise(resolve => setTimeout(resolve, 0));
            if (eventHandlers['open']) eventHandlers['open'].forEach(h => h());
            await connectPromise;
        });

        it('should subscribe to user channel', () => {
            console.log('Is connected?', wsModule.websocketService.isConnected());
            mockSend.mockClear();
            wsModule.websocketService.subscribeToUserChannel('user-123');

            const lastCallArgs = mockSend.mock.lastCall;
            expect(lastCallArgs).toBeTruthy();
            const message = JSON.parse(lastCallArgs[0]);
            expect(message).toEqual(expect.objectContaining({
                event: 'pusher:subscribe',
                data: { channel: 'private-user.user-123' }
            }));
        });

        it('should not subscribe if not connected', async () => {
            const loggerModule = await import('../utils/logger.js');
            wsModule.websocketService.disconnect(); // manually disconnect first
            mockSend.mockClear();

            wsModule.websocketService.subscribeToUserChannel('user-123');

            expect(mockSend).not.toHaveBeenCalled();
            expect(loggerModule.logger.warn).toHaveBeenCalledWith('websocket', 'Cannot subscribe: not connected');
        });

        it('should disconnect manualy and unsubscribe', () => {
            // First subscribe so we have a userId set
            wsModule.websocketService.subscribeToUserChannel('user-123');
            mockSend.mockClear();

            wsModule.websocketService.disconnect();

            // Verify unsubscribe message sent
            const lastCallArgs = mockSend.mock.lastCall;
            expect(lastCallArgs).toBeTruthy();
            const message = JSON.parse(lastCallArgs[0]);
            expect(message).toEqual(expect.objectContaining({
                event: 'pusher:unsubscribe',
                data: { channel: 'private-user.user-123' }
            }));

            expect(mockClose).toHaveBeenCalled();
            expect(wsModule.websocketService.isConnected()).toBe(false);
        });

        it('should handle onDisconnect handler', () => {
            const handler = vi.fn();
            wsModule.websocketService.onDisconnect(handler);

            wsModule.websocketService.disconnect();

            expect(handler).toHaveBeenCalled();
        });
    });
});
