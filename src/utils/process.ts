import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { logger } from './logger.js';

const PID_FILE = path.join(os.homedir(), '.config', 'stint', 'daemon.pid');

/**
 * Check if a process is running by PID
 */
export function isProcessRunning(pid: number): boolean {
    try {
        // process.kill with signal 0 doesn't actually kill the process
        // It just checks if the process exists
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

/**
 * Kill a process by PID
 */
export function killProcess(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
    try {
        process.kill(pid, signal);
        logger.info('process', `Sent ${signal} to process ${pid}`);
    } catch (error) {
        logger.error('process', `Failed to kill process ${pid}`, error as Error);
        throw new Error(`Failed to kill process ${pid}: ${(error as Error).message}`);
    }
}

/**
 * Spawn a detached background process
 */
export function spawnDetached(
    command: string,
    args: string[],
    options: {
        cwd?: string;
        env?: NodeJS.ProcessEnv;
        stdout?: string;
        stderr?: string;
    } = {}
): number {
    const logDir = path.join(os.homedir(), '.config', 'stint', 'logs');

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    const stdoutPath = options.stdout || path.join(logDir, 'daemon.log');
    const stderrPath = options.stderr || path.join(logDir, 'daemon-error.log');

    const out = fs.openSync(stdoutPath, 'a');
    const err = fs.openSync(stderrPath, 'a');

    const child = spawn(command, args, {
        detached: true,
        stdio: ['ignore', out, err],
        cwd: options.cwd || process.cwd(),
        env: options.env || process.env,
    });

    // Unreference the child so the parent can exit
    child.unref();

    logger.info('process', `Spawned detached process ${child.pid}`);

    return child.pid!;
}

/**
 * Write PID to file
 */
export function writePidFile(pid: number): void {
    const pidDir = path.dirname(PID_FILE);

    if (!fs.existsSync(pidDir)) {
        fs.mkdirSync(pidDir, { recursive: true });
    }

    fs.writeFileSync(PID_FILE, pid.toString(), { mode: 0o600 });
    logger.info('process', `Wrote PID ${pid} to ${PID_FILE}`);
}

/**
 * Read PID from file
 */
export function readPidFile(): number | null {
    try {
        if (!fs.existsSync(PID_FILE)) {
            return null;
        }

        const pidStr = fs.readFileSync(PID_FILE, 'utf8').trim();
        const pid = parseInt(pidStr, 10);

        if (isNaN(pid)) {
            logger.warn('process', `Invalid PID in file: ${pidStr}`);
            return null;
        }

        return pid;
    } catch (error) {
        logger.error('process', 'Failed to read PID file', error as Error);
        return null;
    }
}

/**
 * Remove PID file
 */
export function removePidFile(): void {
    try {
        if (fs.existsSync(PID_FILE)) {
            fs.unlinkSync(PID_FILE);
            logger.info('process', 'Removed PID file');
        }
    } catch (error) {
        logger.error('process', 'Failed to remove PID file', error as Error);
    }
}

/**
 * Validate PID file - check if process is actually running
 */
export function validatePidFile(): { valid: boolean; pid: number | null } {
    const pid = readPidFile();

    if (pid === null) {
        return { valid: false, pid: null };
    }

    const running = isProcessRunning(pid);

    if (!running) {
        logger.warn('process', `PID file exists but process ${pid} is not running`);
        removePidFile();
        return { valid: false, pid: null };
    }

    return { valid: true, pid };
}

/**
 * Get PID file path
 */
export function getPidFilePath(): string {
    return PID_FILE;
}
