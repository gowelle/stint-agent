import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { config } from '../utils/config.js';
import { authService } from './auth.js';
import { logger } from '../utils/logger.js';
import { PendingCommit, Project, Suggestion } from '../types/index.js';

// Status file path for daemon status reporting
const STATUS_FILE_PATH = path.join(os.homedir(), '.config', 'stint', 'daemon.status.json');

interface DaemonStatus {
    websocket: {
        connected: boolean;
        channel?: string;
        lastEvent?: string;
        lastEventTime?: string;
    };
}

function writeStatus(update: Partial<DaemonStatus['websocket']>): void {
    try {
        const dir = path.dirname(STATUS_FILE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        let status: DaemonStatus = { websocket: { connected: false } };
        if (fs.existsSync(STATUS_FILE_PATH)) {
            try {
                status = JSON.parse(fs.readFileSync(STATUS_FILE_PATH, 'utf8'));
            } catch {
                // File corrupted, start fresh
            }
        }

        status.websocket = { ...status.websocket, ...update };
        fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(status, null, 2));
    } catch {
        // Silent fail - status file is non-critical
    }
}

class WebSocketServiceImpl {
    private echo: Echo<'reverb'> | null = null;
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

    /**
     * Connect to the WebSocket server using Laravel Echo
     * @throws Error if connection fails or no auth token available
     */
    async connect(): Promise<void> {
        try {
            const token = await authService.getToken();
            if (!token) {
                throw new Error('No authentication token available');
            }

            const reverbAppKey = config.getReverbAppKey();
            if (!reverbAppKey) {
                throw new Error('Reverb app key not configured');
            }

            const apiUrl = config.getApiUrl();
            const environment = config.getEnvironment();

            // Determine WebSocket host and port based on environment
            let wsHost: string;
            let wsPort: number;
            let forceTLS: boolean;

            if (environment === 'development') {
                wsHost = 'localhost';
                wsPort = 8080;
                forceTLS = false;
            } else {
                wsHost = 'stint.codes';
                wsPort = 443;
                forceTLS = true;
            }

            logger.info('websocket', `Connecting to ${wsHost}:${wsPort} with key ${reverbAppKey}...`);

            // Create Pusher client for Node.js environment
            // Reverb expects connections at /app/{key} - use default pusher-js behavior
            const pusherClient = new Pusher(reverbAppKey, {
                wsHost,
                wsPort,
                forceTLS,
                enabledTransports: ['ws', 'wss'],
                disableStats: true,
                cluster: '', // Required but unused for Reverb
                authorizer: (channel) => ({
                    authorize: async (socketId: string, callback: (error: Error | null, authData?: { auth: string }) => void) => {
                        try {
                            const response = await fetch(`${apiUrl}/api/broadcasting/auth`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Accept': 'application/json',
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    socket_id: socketId,
                                    channel_name: channel.name,
                                }),
                            });

                            if (!response.ok) {
                                const errorText = await response.text();
                                logger.error('websocket', `Auth failed (${response.status}): ${errorText}`);
                                callback(new Error(`Auth failed: ${response.status}`));
                                return;
                            }

                            const data = await response.json() as { auth: string };
                            callback(null, data);
                        } catch (error) {
                            logger.error('websocket', 'Channel auth error', error as Error);
                            callback(error as Error);
                        }
                    },
                }),
            });

            // Create Echo instance
            this.echo = new Echo({
                broadcaster: 'reverb',
                key: reverbAppKey,
                wsHost,
                wsPort,
                forceTLS,
                disableStats: true,
                enabledTransports: ['ws', 'wss'],
                authEndpoint: `${apiUrl}/api/broadcasting/auth`,
                auth: {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json',
                    },
                },
                client: pusherClient,
            });

            logger.info('websocket', 'Echo instance created, setting up connection handlers...');

            return new Promise((resolve, reject) => {
                if (!this.echo) {
                    reject(new Error('Echo not initialized'));
                    return;
                }

                // Add connection timeout
                const connectionTimeout = setTimeout(() => {
                    const state = this.echo?.connector.pusher.connection.state || 'unknown';
                    logger.error('websocket', `Connection timeout after 15s (state: ${state})`);
                    reject(new Error(`Connection timeout - stuck in state: ${state}`));
                }, 15000);

                // Log all state changes for debugging
                this.echo.connector.pusher.connection.bind('state_change', (states: { previous: string; current: string }) => {
                    logger.info('websocket', `Connection state: ${states.previous} -> ${states.current}`);
                });

                // Bind to connection events
                this.echo.connector.pusher.connection.bind('connected', () => {
                    clearTimeout(connectionTimeout);
                    logger.success('websocket', '✅ Connected to Broadcaster via Sanctum');
                    writeStatus({ connected: true });
                    this.reconnectAttempts = 0;
                    this.isManualDisconnect = false;
                    resolve();
                });

                this.echo.connector.pusher.connection.bind('error', (error: unknown) => {
                    clearTimeout(connectionTimeout);
                    const errorMessage = error instanceof Error
                        ? error.message
                        : JSON.stringify(error) || 'Unknown connection error';
                    logger.error('websocket', `WebSocket error: ${errorMessage}`);
                    reject(new Error(errorMessage));
                });

                this.echo.connector.pusher.connection.bind('disconnected', () => {
                    logger.warn('websocket', 'WebSocket disconnected');
                    writeStatus({ connected: false });
                    this.handleDisconnect();
                });

                this.echo.connector.pusher.connection.bind('failed', () => {
                    clearTimeout(connectionTimeout);
                    logger.error('websocket', 'WebSocket connection failed');
                    reject(new Error('WebSocket connection failed'));
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

        if (this.echo) {
            // Leave the private channel if subscribed
            if (this.userId) {
                this.echo.leave(`user.${this.userId}`);
            }

            this.echo.disconnect();
            this.echo = null;
            logger.info('websocket', 'WebSocket disconnected');
        }
    }

    /**
     * Check if WebSocket is currently connected
     * @returns True if connected and ready
     */
    isConnected(): boolean {
        return this.echo !== null &&
            this.echo.connector.pusher.connection.state === 'connected';
    }

    /**
     * Subscribe to user-specific private channel for real-time updates
     * @param userId - User ID to subscribe to
     */
    async subscribeToUserChannel(userId: string): Promise<void> {
        this.userId = userId;

        if (!this.echo) {
            logger.warn('websocket', 'Cannot subscribe: not connected');
            return;
        }

        if (!this.isConnected()) {
            logger.warn('websocket', 'Cannot subscribe: not connected');
            return;
        }

        const channel = `user.${userId}`;
        logger.info('websocket', `Subscribing to private channel: ${channel}`);

        // Subscribe to private channel and set up event listeners
        const privateChannel = this.echo.private(channel);
        writeStatus({ channel });

        // Listen for all events
        privateChannel
            .listen('.commit.approved', (data: { pendingCommit: PendingCommit & { project: Project } }) => {
                logger.info('websocket', `Commit approved: ${data.pendingCommit.id}`);
                writeStatus({ lastEvent: 'commit.approved', lastEventTime: new Date().toISOString() });
                this.commitApprovedHandlers.forEach((handler) =>
                    handler(data.pendingCommit, data.pendingCommit.project)
                );
            })
            .listen('.commit.pending', (data: { pendingCommit: PendingCommit }) => {
                logger.info('websocket', `Commit pending: ${data.pendingCommit.id}`);
                writeStatus({ lastEvent: 'commit.pending', lastEventTime: new Date().toISOString() });
                this.commitPendingHandlers.forEach((handler) => handler(data.pendingCommit));
            })
            .listen('.suggestion.created', (data: { suggestion: Suggestion }) => {
                logger.info('websocket', `Suggestion created: ${data.suggestion.id}`);
                writeStatus({ lastEvent: 'suggestion.created', lastEventTime: new Date().toISOString() });
                this.suggestionCreatedHandlers.forEach((handler) => handler(data.suggestion));
            })
            .listen('.project.updated', (data: { project: Project }) => {
                logger.info('websocket', `Project updated: ${data.project.id}`);
                writeStatus({ lastEvent: 'project.updated', lastEventTime: new Date().toISOString() });
                this.projectUpdatedHandlers.forEach((handler) => handler(data.project));
            })
            .listen('.sync.requested', (data: { project: Project }) => {
                logger.info('websocket', `Sync requested for project: ${data.project.id}`);
                writeStatus({ lastEvent: 'sync.requested', lastEventTime: new Date().toISOString() });
                this.syncRequestedHandlers.forEach((handler) => handler(data.project.id));
            })
            .listen('.agent.disconnected', (data: { reason?: string }) => {
                const reason = data.reason ?? 'Server requested disconnect';
                logger.warn('websocket', `Agent disconnected by server: ${reason}`);
                writeStatus({ lastEvent: 'agent.disconnected', lastEventTime: new Date().toISOString() });
                this.agentDisconnectedHandlers.forEach((handler) => handler(reason));
            });

        logger.success('websocket', `Subscribed to private channel: ${channel}`);
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

    private handleDisconnect(): void {
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
