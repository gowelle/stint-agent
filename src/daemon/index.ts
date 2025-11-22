import { authService } from '../services/auth.js';
import { apiService } from '../services/api.js';
import { logger } from '../utils/logger.js';
import { removePidFile } from '../utils/process.js';

let heartbeatInterval: NodeJS.Timeout | null = null;
let isShuttingDown = false;

/**
 * Start the daemon process
 */
export async function startDaemon(): Promise<void> {
    logger.info('daemon', 'Starting daemon...');

    try {
        // Validate authentication
        const user = await authService.validateToken();
        if (!user) {
            throw new Error('Not authenticated. Please run "stint login" first.');
        }

        logger.info('daemon', `Authenticated as ${user.email}`);

        // Connect to API and register agent session
        logger.info('daemon', 'Connecting to API...');
        const session = await apiService.connect();
        logger.success('daemon', `Agent session connected: ${session.id}`);

        // Set up signal handlers for graceful shutdown
        setupSignalHandlers();

        // Start heartbeat loop
        startHeartbeat();

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
            await shutdown();
            process.exit(0);
        });
    });

    logger.info('daemon', 'Signal handlers registered');
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info('daemon', 'Shutting down daemon...');

    // Stop heartbeat
    stopHeartbeat();

    // Disconnect from API
    try {
        await apiService.disconnect();
        logger.info('daemon', 'Disconnected from API');
    } catch (error) {
        logger.error('daemon', 'Failed to disconnect from API', error as Error);
    }

    // Remove PID file
    removePidFile();

    logger.success('daemon', 'Daemon shutdown complete');
}
