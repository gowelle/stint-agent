import WebSocket from 'ws';
import { config } from '../utils/config.js';
import { authService } from './auth.js';
import { logger } from '../utils/logger.js';
import { PendingCommit, Project, Suggestion } from '../types/index.js';

class WebSocketServiceImpl {
    private ws: WebSocket | null = null;
    private userId: string | null = null;
    private socketId: string | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private isManualDisconnect = false;

    // Event handlers
    private commitApprovedHandlers: Array<(commit: PendingCommit, project: Project) => void> = [];
    private commitPendingHandlers: Array<(commit: PendingCommit) => void> = [];
    private suggestionCreatedHandlers: Array<(suggestion: Suggestion) => void> = [];
    private projectUpdatedHandlers: Array<(project: Project) => void> = [];
    private disconnectHandlers: Array<() => void> = [];
    private agentDisconnectedHandlers: Array<(reason?: string) => void> = [];
    private syncRequestedHandlers: Array<(projectId: string) => void> = [];

    /**
     * Connect to the WebSocket server
     * @throws Error if connection fails or no auth token available
     */
    async connect(): Promise<void> {
        try {
            const token = await authService.getToken();
            if (!token) {
                throw new Error('No authentication token available');
            }

            const wsUrl = config.getWsUrl();
            const url = `${wsUrl}?token=${encodeURIComponent(token)}`;

            logger.info('websocket', `Connecting to ${wsUrl}...`);

            this.ws = new WebSocket(url);

            return new Promise((resolve, reject) => {
                if (!this.ws) {
                    reject(new Error('WebSocket not initialized'));
                    return;
                }

                this.ws.on('open', () => {
                    logger.success('websocket', 'WebSocket connected');
                    this.reconnectAttempts = 0;
                    this.isManualDisconnect = false;
                    resolve();
                });

                this.ws.on('message', (data: Buffer) => {
                    this.handleMessage(data);
                });

                this.ws.on('close', () => {
                    logger.warn('websocket', 'WebSocket disconnected');
                    this.handleDisconnect();
                });

                this.ws.on('error', (error: Error) => {
                    logger.error('websocket', 'WebSocket error', error);
                    reject(error);
                });
            });
        } catch (error) {
            logger.error('websocket', 'Failed to connect', error as Error);
            throw error;
        }
    }

    /**
     * Disconnect from the WebSocket server
     * Prevents automatic reconnection
     */
    disconnect(): void {
        this.isManualDisconnect = true;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            // Unsubscribe from channel if subscribed
            if (this.userId) {
                this.sendMessage({
                    event: 'pusher:unsubscribe',
                    data: {
                        channel: `private-user.${this.userId}`,
                    },
                });
            }

            this.ws.close();
            this.ws = null;
            logger.info('websocket', 'WebSocket disconnected');
        }
    }

    /**
     * Check if WebSocket is currently connected
     * @returns True if connected and ready
     */
    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Subscribe to user-specific channel for real-time updates
     * @param userId - User ID to subscribe to
     */
    async subscribeToUserChannel(userId: string): Promise<void> {
        this.userId = userId;

        if (this.userId) {
            const channel = `user.${this.userId}`;
            logger.info('websocket', `Subscribing to channel: ${channel}`);
            this.sendMessage({
                event: 'pusher:subscribe',
                data: {
                    channel,
                },
            });
        }
    }

    /**
     * Get authentication signature for private channel from Laravel backend
     */
    private async getChannelAuth(channel: string, socketId: string): Promise<string> {
        const { apiService } = await import('./api.js');

        const response = await apiService.request<{ auth: string }>('/api/broadcasting/auth', {
            method: 'POST',
            body: JSON.stringify({
                socket_id: socketId,
                channel_name: channel,
            }),
        });

        return response.auth;
    }

    /**
     * Register handler for commit approved events
     * @param handler - Callback function
     */
    onCommitApproved(handler: (commit: PendingCommit, project: Project) => void): void {
        this.commitApprovedHandlers.push(handler);
    }

    onCommitPending(handler: (commit: PendingCommit) => void): void {
        this.commitPendingHandlers.push(handler);
    }

    onSuggestionCreated(handler: (suggestion: Suggestion) => void): void {
        this.suggestionCreatedHandlers.push(handler);
    }

    onProjectUpdated(handler: (project: Project) => void): void {
        this.projectUpdatedHandlers.push(handler);
    }

    onDisconnect(handler: () => void): void {
        this.disconnectHandlers.push(handler);
    }

    onAgentDisconnected(handler: (reason?: string) => void): void {
        this.agentDisconnectedHandlers.push(handler);
    }

    onSyncRequested(handler: (projectId: string) => void): void {
        this.syncRequestedHandlers.push(handler);
    }

    private sendMessage(message: Record<string, unknown>): void {
        if (!this.isConnected()) {
            logger.warn('websocket', 'Cannot send message: not connected');
            return;
        }

        this.ws!.send(JSON.stringify(message));
    }

    private async handleMessage(data: Buffer): Promise<void> {
        try {
            const message = JSON.parse(data.toString());

            logger.info('websocket', `Received message: ${message.event}`);

            // Handle Pusher protocol messages
            if (message.event === 'pusher:connection_established') {
                try {
                    const connectionData = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
                    this.socketId = connectionData.socket_id;
                    logger.success('websocket', `Connection established (socket_id: ${this.socketId})`);

                    // If we have a pending user ID to subscribe to, do it now
                    if (this.userId) {
                        this.subscribeToUserChannel(this.userId);
                    }
                } catch (error) {
                    logger.success('websocket', 'Connection established');
                }
                return;
            }

            if (message.event === 'pusher_internal:subscription_succeeded') {
                logger.success('websocket', `Subscribed to channel: ${message.channel}`);
                return;
            }

            if (message.event === 'pusher:error') {
                try {
                    const errorData = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
                    const errorCode = errorData.code;
                    const errorMessage = errorData.message;

                    logger.error('websocket', `WebSocket error (${errorCode}): ${errorMessage}`);

                    // Handle specific error codes
                    if (errorCode === 4001) {
                        logger.error('websocket', 'Application does not exist - check Reverb app key configuration');
                    } else if (errorCode === 4009) {
                        logger.error('websocket', 'Connection is unauthorized - authentication token may be invalid or expired');
                        // Notify user about authentication issue
                        const { notify } = await import('../utils/notify.js');
                        notify({
                            title: 'Stint Agent - Connection Issue',
                            message: 'WebSocket authentication failed. Notifications may be delayed (falling back to polling).',
                        });
                    }
                } catch (parseError) {
                    logger.error('websocket', `WebSocket error: ${JSON.stringify(message.data)}`);
                }
                return;
            }

            // Handle custom events
            if (message.event === 'commit.approved') {
                const { pendingCommit } = message.data;
                logger.info('websocket', `Commit approved: ${pendingCommit.id}`);
                this.commitApprovedHandlers.forEach((handler) => handler(pendingCommit, pendingCommit.project));
                return;
            }

            if (message.event === 'commit.pending') {
                const { pendingCommit } = message.data;
                logger.info('websocket', `Commit pending: ${pendingCommit.id}`);
                this.commitPendingHandlers.forEach((handler) => handler(pendingCommit));
                return;
            }

            if (message.event === 'suggestion.created') {
                const { suggestion } = message.data;
                logger.info('websocket', `Suggestion created: ${suggestion.id}`);
                this.suggestionCreatedHandlers.forEach((handler) => handler(suggestion));
                return;
            }

            if (message.event === 'project.updated') {
                const { project } = message.data;
                logger.info('websocket', `Project updated: ${project.id}`);
                this.projectUpdatedHandlers.forEach((handler) => handler(project));
                return;
            }

            if (message.event === 'sync.requested') {
                const { project } = message.data;
                logger.info('websocket', `Sync requested for project: ${project.id}`);
                this.syncRequestedHandlers.forEach((handler) => handler(project.id));
                return;
            }

            if (message.event === 'agent.disconnected') {
                const { reason } = message.data;
                logger.warn('websocket', `Agent disconnected by server: ${reason ?? 'Server requested disconnect'}`);
                this.agentDisconnectedHandlers.forEach((handler) => handler(reason ?? 'Server requested disconnect'));
                return;
            }

            logger.info('websocket', `Unhandled event: ${message.event}, payload: ${JSON.stringify(message)}`);
        } catch (error) {
            logger.error('websocket', 'Failed to parse message', error as Error);
        }
    }

    private handleDisconnect(): void {
        this.ws = null;

        // Call disconnect handlers
        this.disconnectHandlers.forEach((handler) => handler());

        // Don't reconnect if it was a manual disconnect
        if (this.isManualDisconnect) {
            return;
        }

        // Attempt to reconnect with exponential backoff
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            const delay = this.getReconnectDelay();
            this.reconnectAttempts++;

            logger.info('websocket', `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            this.reconnectTimer = setTimeout(async () => {
                try {
                    await this.connect();

                    // Re-subscribe to user channel if we were subscribed
                    if (this.userId) {
                        await this.subscribeToUserChannel(this.userId);
                    }
                } catch (error) {
                    logger.error('websocket', 'Reconnection failed', error as Error);
                }
            }, delay);
        } else {
            logger.error('websocket', 'Max reconnection attempts reached');
        }
    }

    /**
     * Get reconnect delay with exponential backoff and jitter
     * Jitter prevents thundering herd problem when many clients reconnect simultaneously
     */
    private getReconnectDelay(): number {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
        const delays = [1000, 2000, 4000, 8000, 16000, 30000];
        const index = Math.min(this.reconnectAttempts, delays.length - 1);
        const baseDelay = delays[index];

        // Add 0-30% jitter to prevent synchronized reconnections
        const jitter = baseDelay * (Math.random() * 0.3);
        return Math.floor(baseDelay + jitter);
    }
}

export const websocketService = new WebSocketServiceImpl();
