import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerDaemonCommands } from './daemon.js';

// Mock dependencies using vi.hoisted for proper hoisting
const { mockGetProcessStats, mockValidatePidFile } = vi.hoisted(() => ({
  mockGetProcessStats: vi.fn(),
  mockValidatePidFile: vi.fn(),
}));

vi.mock('../utils/monitor.js', () => ({
  getProcessStats: mockGetProcessStats,
}));

vi.mock('../utils/process.js', () => ({
  validatePidFile: mockValidatePidFile,
  killProcess: vi.fn(),
  spawnDetached: vi.fn(),
  isProcessRunning: vi.fn(),
  getPidFilePath: vi.fn().mockReturnValue('/tmp/stint.pid'),
}));

vi.mock('../services/auth.js', () => ({
  authService: {
    validateToken: vi.fn().mockResolvedValue({ email: 'test@example.com' }),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('ora', () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    fail: vi.fn(),
    succeed: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    text: '',
  }),
}));

vi.mock('chalk', () => ({
  default: {
    blue: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    gray: (s: string) => s,
    bold: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
  },
}));

describe('Daemon Commands', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('registerDaemonCommands', () => {
    it('should register the daemon command with subcommands', () => {
      const program = new Command();
      registerDaemonCommands(program);

      const daemonCmd = program.commands.find(cmd => cmd.name() === 'daemon');
      expect(daemonCmd).toBeDefined();
      expect(daemonCmd?.description()).toBe('Manage the Stint daemon');
    });

    it('should register start subcommand', () => {
      const program = new Command();
      registerDaemonCommands(program);

      const daemonCmd = program.commands.find(cmd => cmd.name() === 'daemon');
      const startCmd = daemonCmd?.commands.find(cmd => cmd.name() === 'start');
      expect(startCmd).toBeDefined();
      expect(startCmd?.description()).toBe('Start the daemon in the background');
    });

    it('should register stop subcommand', () => {
      const program = new Command();
      registerDaemonCommands(program);

      const daemonCmd = program.commands.find(cmd => cmd.name() === 'daemon');
      const stopCmd = daemonCmd?.commands.find(cmd => cmd.name() === 'stop');
      expect(stopCmd).toBeDefined();
      expect(stopCmd?.description()).toBe('Stop the running daemon');
    });

    it('should register status subcommand', () => {
      const program = new Command();
      registerDaemonCommands(program);

      const daemonCmd = program.commands.find(cmd => cmd.name() === 'daemon');
      const statusCmd = daemonCmd?.commands.find(cmd => cmd.name() === 'status');
      expect(statusCmd).toBeDefined();
      expect(statusCmd?.description()).toBe('Check if the daemon is running');
    });

    it('should register logs subcommand', () => {
      const program = new Command();
      registerDaemonCommands(program);

      const daemonCmd = program.commands.find(cmd => cmd.name() === 'daemon');
      const logsCmd = daemonCmd?.commands.find(cmd => cmd.name() === 'logs');
      expect(logsCmd).toBeDefined();
      expect(logsCmd?.description()).toBe('View and filter daemon logs');
    });

    it('should register restart subcommand', () => {
      const program = new Command();
      registerDaemonCommands(program);

      const daemonCmd = program.commands.find(cmd => cmd.name() === 'daemon');
      const restartCmd = daemonCmd?.commands.find(cmd => cmd.name() === 'restart');
      expect(restartCmd).toBeDefined();
      expect(restartCmd?.description()).toBe('Restart the daemon');
    });
  });

  describe('Utility Functions', () => {
    it('should export registerDaemonCommands function', () => {
      expect(typeof registerDaemonCommands).toBe('function');
    });
  });
});
