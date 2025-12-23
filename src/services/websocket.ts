import WebSocket from 'ws';
import { config } from '../utils/config.js';
import { authService } from './auth.js';
import { logger } from '../utils/logger.js';
import { PendingCommit, Project, Suggestion } from '../types/index.js';

class WebSocketServiceImpl {
    private ws: WebSocket | null = null;
    private userId: string | null = null;
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

    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    subscribeToUserChannel(userId: string): void {
        this.userId = userId;

        if (!this.isConnected()) {
            logger.warn('websocket', 'Cannot subscribe: not connected');
            return;
        }

        const channel = `private-user.${userId}`;
        logger.info('websocket', `Subscribing to channel: ${channel}`);

        this.sendMessage({
            event: 'pusher:subscribe',
            data: {
                channel,
            },
        });
    }

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

    private handleMessage(data: Buffer): void {
        try {
            const message = JSON.parse(data.toString());

            logger.debug('websocket', `Received message: ${message.event}`);

            // Handle Pusher protocol messages
            if (message.event === 'pusher:connection_established') {
                logger.success('websocket', 'Connection established');
                return;
            }

            if (message.event === 'pusher_internal:subscription_succeeded') {
                logger.success('websocket', `Subscribed to channel: ${message.channel}`);
                return;
            }

            // Handle custom events
            if (message.event === 'commit.approved') {
                const { commit, project } = message.data;
                logger.info('websocket', `Commit approved: ${commit.id}`);
                this.commitApprovedHandlers.forEach((handler) => handler(commit, project));
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
                const { projectId } = message.data;
                logger.info('websocket', `Sync requested for project: ${projectId}`);
                this.syncRequestedHandlers.forEach((handler) => handler(projectId));
                return;
            }

            if (message.event === 'agent.disconnected') {
                const reason = message.data?.reason || 'Server requested disconnect';
                logger.warn('websocket', `Agent disconnected by server: ${reason}`);
                this.agentDisconnectedHandlers.forEach((handler) => handler(reason));
                return;
            }

            logger.debug('websocket', `Unhandled event: ${message.event}`);
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
                        this.subscribeToUserChannel(this.userId);
                    }
                } catch (error) {
                    logger.error('websocket', 'Reconnection failed', error as Error);
                }
            }, delay);
        } else {
            logger.error('websocket', 'Max reconnection attempts reached');
        }
    }

    private getReconnectDelay(): number {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
        const delays = [1000, 2000, 4000, 8000, 16000, 30000];
        const index = Math.min(this.reconnectAttempts, delays.length - 1);
        return delays[index];
    }
}

export const websocketService = new WebSocketServiceImpl();
