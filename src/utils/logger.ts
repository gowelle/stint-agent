import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_DIR = path.join(os.homedir(), '.config', 'stint', 'logs');
const AGENT_LOG = path.join(LOG_DIR, 'agent.log');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 7;

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

class Logger {
    private ensureLogDir(): void {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
    }

    private rotateLog(logFile: string): void {
        if (!fs.existsSync(logFile)) return;

        const stats = fs.statSync(logFile);
        if (stats.size < MAX_LOG_SIZE) return;

        // Rotate logs
        for (let i = MAX_LOG_FILES - 1; i > 0; i--) {
            const oldFile = `${logFile}.${i}`;
            const newFile = `${logFile}.${i + 1}`;
            if (fs.existsSync(oldFile)) {
                if (i === MAX_LOG_FILES - 1) {
                    fs.unlinkSync(oldFile);
                } else {
                    fs.renameSync(oldFile, newFile);
                }
            }
        }

        fs.renameSync(logFile, `${logFile}.1`);
    }

    private writeLog(level: LogLevel, category: string, message: string, logFile: string): void {
        this.ensureLogDir();
        this.rotateLog(logFile);

        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${level.padEnd(5)} [${category}] ${message}\n`;

        fs.appendFileSync(logFile, logLine);
    }

    info(category: string, message: string): void {
        this.writeLog('INFO', category, message, AGENT_LOG);
        console.log(`ℹ [${category}] ${message}`);
    }

    warn(category: string, message: string): void {
        this.writeLog('WARN', category, message, AGENT_LOG);
        console.warn(`⚠ [${category}] ${message}`);
    }

    error(category: string, message: string, error?: Error): void {
        const fullMessage = error ? `${message}: ${error.message}` : message;
        this.writeLog('ERROR', category, fullMessage, ERROR_LOG);
        this.writeLog('ERROR', category, fullMessage, AGENT_LOG);
        console.error(`✖ [${category}] ${fullMessage}`);

        if (error?.stack) {
            this.writeLog('ERROR', category, error.stack, ERROR_LOG);
        }
    }

    debug(category: string, message: string): void {
        if (process.env.DEBUG) {
            this.writeLog('DEBUG', category, message, AGENT_LOG);
            console.debug(`🐛 [${category}] ${message}`);
        }
    }

    success(category: string, message: string): void {
        this.writeLog('INFO', category, message, AGENT_LOG);
        console.log(`✓ [${category}] ${message}`);
    }
}

export const logger = new Logger();
