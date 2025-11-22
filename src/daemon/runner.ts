#!/usr/bin/env node

/**
 * Daemon Runner - Entry point for the background daemon process
 * This file is executed when the daemon is started in detached mode
 */

import { startDaemon } from './index.js';
import { logger } from '../utils/logger.js';
import { writePidFile } from '../utils/process.js';

// Write PID file immediately
writePidFile(process.pid);

// Start the daemon
startDaemon().catch((error) => {
    logger.error('daemon-runner', 'Daemon crashed', error as Error);
    process.exit(1);
});
