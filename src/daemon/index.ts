import { authService } from '../services/auth.js';
import { apiService } from '../services/api.js';
import { websocketService } from '../services/websocket.js';
import { commitQueue } from './queue.js';
import { logger } from '../utils/logger.js';
import { removePidFile } from '../utils/process.js';
import { FileWatcher } from './watcher.js';
import { notify } from '../utils/notify.js';
import { projectService } from '../services/project.js';

let heartbeatInterval: NodeJS.Timeout | null = null;
let isShuttingDown = false;
let shutdownReason: string | undefined;
const fileWatcher = new FileWatcher();

/**
 * Start the daemon process
 */
export async function startDaemon(): Promise<void> {
    logger.info('daemon', 'Starting daemon...');

    try {
        // Validate authentication
        const user = await authService.validateToken();
        if (!user) {
            notify({
                title: 'Stint Agent',
                message: 'Authentication expired. Please run "stint login" to reconnect.',
            });
            throw new Error('Not authenticated. Please run "stint login" first.');
        }

        logger.info('daemon', `Authenticated as ${user.email}`);

        // Connect to API and register agent session
        logger.info('daemon', 'Connecting to API...');
        const session = await apiService.connect();
        logger.success('daemon', `Agent session connected: ${session.id}`);

        // Connect to WebSocket
        logger.info('daemon', 'Connecting to WebSocket...');
        await websocketService.connect();
        logger.success('daemon', 'WebSocket connected');

        // Subscribe to user channel
        websocketService.subscribeToUserChannel(user.id);

        // Register event handlers
        websocketService.onCommitApproved((commit, project) => {
            logger.info('daemon', `Commit approved: ${commit.id} for project ${project.name}`);

            notify({
                title: 'Commit Approved',
                message: `${commit.message}\nProject: ${project.name}`,
            });

            // Add to queue for processing
            commitQueue.addToQueue(commit, project);
        });

        websocketService.onCommitPending((commit) => {
            logger.info('daemon', `Commit pending: ${commit.id}`);

            notify({
                title: 'New Pending Commit',
                message: commit.message,
            });
        });

        websocketService.onProjectUpdated((project) => {
            logger.info('daemon', `Project updated: ${project.id} - ${project.name}`);

            notify({
                title: 'Project Updated',
                message: project.name,
            });
        });

        websocketService.onDisconnect(() => {
            logger.warn('daemon', 'WebSocket disconnected, will attempt to reconnect');
        });

        // Handle server-initiated disconnects (e.g., session invalidated, kicked by admin)
        websocketService.onAgentDisconnected(async (reason) => {
            logger.warn('daemon', `Server disconnected agent: ${reason}`);
            logger.info('daemon', 'Initiating graceful shutdown...');
            await shutdown(`Server: ${reason}`);
            process.exit(0);
        });

        // Handle suggestion created
        websocketService.onSuggestionCreated((suggestion) => {
            logger.info('daemon', `Suggestion created: ${suggestion.title} (${suggestion.priority})`);

            notify({
                title: 'New Suggestion',
                message: `${suggestion.title}\nPriority: ${suggestion.priority}`,
                open: `https://stint.codes/projects/${suggestion.project_id}/suggestions/${suggestion.id}` // Hypothetical URL structure
            });
        });

        // Handle sync requests from server
        websocketService.onSyncRequested(async (projectId) => {
            logger.info('daemon', `Server requested sync for project: ${projectId}`);
            try {
                await fileWatcher.syncProjectById(projectId);
            } catch (error) {
                logger.error('daemon', `Failed to sync project ${projectId}`, error as Error);
            }
        });

        // Set up signal handlers for graceful shutdown
        setupSignalHandlers();

        // Start heartbeat loop
        startHeartbeat();

        // Start file watcher for auto-sync
        fileWatcher.start();

        // Sync all linked projects on startup
        const linkedProjects = projectService.getAllLinkedProjects();
        const projectEntries = Object.entries(linkedProjects);
        if (projectEntries.length > 0) {
            logger.info('daemon', `Syncing ${projectEntries.length} linked project(s) on startup...`);
            for (const [, linkedProject] of projectEntries) {
                try {
                    await fileWatcher.syncProjectById(linkedProject.projectId);
                } catch (error) {
                    logger.error('daemon', `Failed to sync project ${linkedProject.projectId} on startup`, error as Error);
                }
            }
            logger.success('daemon', 'Initial project sync complete');
        }

        logger.success('daemon', 'Daemon started successfully');

        // Keep the process alive
        await new Promise(() => { }); // Infinite promise
    } catch (error) {
        logger.error('daemon', 'Failed to start daemon', error as Error);
        await shutdown();
        throw error;
    }
}

/**
 * Stop the daemon process
 */
export async function stopDaemon(): Promise<void> {
    logger.info('daemon', 'Stopping daemon...');
    await shutdown();
}

/**
 * Get daemon status
 */
export async function getDaemonStatus(): Promise<{ running: boolean; pid?: number }> {
    // This will be called from the CLI, not from within the daemon
    // The actual implementation is in the daemon command
    throw new Error('getDaemonStatus should be called from daemon command');
}

/**
 * Start heartbeat loop
 */
function startHeartbeat(): void {
    const HEARTBEAT_INTERVAL = 30000; // 30 seconds

    logger.info('daemon', 'Starting heartbeat loop (30s interval)');

    heartbeatInterval = setInterval(async () => {
        if (isShuttingDown) return;

        try {
            await apiService.heartbeat();
            logger.debug('daemon', 'Heartbeat sent successfully');
        } catch (error) {
            logger.error('daemon', 'Heartbeat failed', error as Error);
            // Continue running even if heartbeat fails
            // The server will eventually timeout the session
        }
    }, HEARTBEAT_INTERVAL);
}

/**
 * Stop heartbeat loop
 */
function stopHeartbeat(): void {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        logger.info('daemon', 'Heartbeat loop stopped');
    }
}

/**
 * Setup signal handlers for graceful shutdown
 */
function setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

    signals.forEach((signal) => {
        process.on(signal, async () => {
            logger.info('daemon', `Received ${signal}, shutting down...`);
            await shutdown(`Signal: ${signal}`);
            process.exit(0);
        });
    });

    logger.info('daemon', 'Signal handlers registered');
}

/**
 * Graceful shutdown
 */
async function shutdown(reason?: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;
    shutdownReason = reason;

    logger.info('daemon', 'Shutting down daemon...');

    // Stop heartbeat
    stopHeartbeat();

    // Stop file watcher
    try {
        fileWatcher.stop();
        logger.info('daemon', 'File watcher stopped');
    } catch (error) {
        logger.error('daemon', 'Failed to stop file watcher', error as Error);
    }

    // Disconnect WebSocket
    try {
        websocketService.disconnect();
        logger.info('daemon', 'Disconnected from WebSocket');
    } catch (error) {
        logger.error('daemon', 'Failed to disconnect from WebSocket', error as Error);
    }

    // Disconnect from API
    try {
        await apiService.disconnect(shutdownReason);
        logger.info('daemon', 'Disconnected from API');
    } catch (error) {
        logger.error('daemon', 'Failed to disconnect from API', error as Error);
    }

    // Remove PID file
    removePidFile();

    logger.success('daemon', 'Daemon shutdown complete');
}
