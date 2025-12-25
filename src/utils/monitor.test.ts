import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import os from 'os';

// Use vi.hoisted to properly hoist mock functions
const { mockExecSync, mockReadFileSync } = vi.hoisted(() => ({
    mockExecSync: vi.fn(),
    mockReadFileSync: vi.fn(),
}));

// Mock modules with hoisted mocks
vi.mock('child_process', () => ({
    execSync: mockExecSync,
}));

vi.mock('fs', () => ({
    readFileSync: mockReadFileSync,
}));

vi.mock('../utils/logger.js', () => ({
    logger: {
        error: vi.fn(),
    },
}));

// Import after mocks are set up
import { getProcessStats } from './monitor.js';

describe('Process Monitor', () => {
    // Set up os spies once for all tests
    const platformSpy = vi.spyOn(os, 'platform');
    vi.spyOn(os, 'cpus').mockReturnValue(Array(4).fill({ speed: 2000 }) as os.CpuInfo[]);
    vi.spyOn(os, 'uptime').mockReturnValue(3600);
    vi.spyOn(os, 'totalmem').mockReturnValue(8 * 1024 * 1024 * 1024); // 8GB

    beforeEach(() => {
        // Clear mock calls
        mockReadFileSync.mockClear();
        mockExecSync.mockClear();
        platformSpy.mockClear();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    describe('Linux', () => {
        beforeEach(() => {
            platformSpy.mockReturnValue('linux');
        });

        it('should get Linux process stats', () => {
            // Mock /proc/[pid]/stat - field index 19 is threads (1-indexed as field 20)
            const mockStat = '1234 (test) S 1 1 1 0 -1 4194304 1234 0 0 0 100 50 0 0 20 0 4 0 1000 1000000 1000 18446744073709551615 1 1 0 0 0 0 0 0 0 0 0 0 0 0 17 0 0 0 0 0 0 0 0 0 0 0 0 0 0';
            mockReadFileSync.mockImplementation((path: unknown) => {
                const pathStr = String(path);
                if (pathStr.includes('/status')) return 'Name: test\nVmRSS: 50000 kB\nThreads: 4';
                if (pathStr.includes('/stat')) return mockStat;
                throw new Error(`Unexpected path: ${pathStr}`);
            });

            const stats = getProcessStats(1234);

            expect(stats).toEqual({
                pid: 1234,
                cpuPercent: expect.any(Number),
                memoryMB: expect.closeTo(48.83, 0.01), // 50000 kB ≈ 48.83 MB
                uptime: expect.any(Number),
                threads: 4,
            });
        });
    });

    describe('macOS', () => {
        beforeEach(() => {
            platformSpy.mockReturnValue('darwin');
        });

        it('should get macOS process stats', () => {
            mockExecSync.mockReturnValue('  CPU   MEM      ELAPSED  THCOUNT\n  2.5  1.2  01:30:00        4');

            const stats = getProcessStats(1234);

            expect(stats).toEqual({
                pid: 1234,
                cpuPercent: 2.5,
                memoryMB: expect.any(Number),
                uptime: 5400, // 1:30:00 = 5400 seconds
                threads: 4,
            });
        });

        it('should parse various elapsed time formats', () => {
            // Test cases: 59 sec, 1:30 (90s), 1:30:00 (5400s), 2-01:30:00 (2 days + 5400s = 178200s)
            const testCases = [
                { input: '  2.5  1.2     59        4', expected: 59 },
                { input: '  2.5  1.2  01:30        4', expected: 90 },
                { input: '  2.5  1.2  01:30:00        4', expected: 5400 },
                { input: '  2.5  1.2  2-01:30:00        4', expected: 178200 }, // 2*86400 + 5400 = 178200
            ];

            for (const { input, expected } of testCases) {
                mockExecSync.mockReturnValue('  CPU   MEM      ELAPSED  THCOUNT\n' + input);
                const stats = getProcessStats(1234);
                expect(stats?.uptime).toBe(expected);
            }
        });
    });

    describe('Windows', () => {
        beforeEach(() => {
            platformSpy.mockReturnValue('win32');
        });

        it('should get Windows process stats', () => {
            // wmic CSV output format after /format:csv:
            // After trim().split('\n'), expect 3 elements where data is at index 2
            // The blank line needs to contain something that survives trim
            // Actual wmic output: [Node header line], [column headers], [data]
            // When split by \n after trim:
            //   [0] = '' or space (empty but part of output)
            //   [1] = headers
            //   [2] = data (this is what we need)
            // 
            // Use a non-whitespace character like 'X' for the first line to ensure 3 elements
            const mockWmicOutput = 'X\nNode,PercentProcessorTime,WorkingSetPrivate,ElapsedTime,ThreadCount\nWIN-PC,25,52428800,3600000,4';
            mockExecSync.mockReturnValue(mockWmicOutput);

            const stats = getProcessStats(1234);

            expect(stats).toEqual({
                pid: 1234,
                cpuPercent: 6.25, // 25% / 4 cores
                memoryMB: 50, // 52428800 bytes ≈ 50 MB
                uptime: 3600, // 3600000 ms = 3600 seconds
                threads: 4,
            });
        });
    });

    describe('Error handling', () => {
        it('should handle unsupported platforms', () => {
            platformSpy.mockReturnValue('freebsd' as NodeJS.Platform);

            const stats = getProcessStats(1234);

            expect(stats).toBeNull();
        });

        it('should handle process not found', () => {
            platformSpy.mockReturnValue('linux');
            mockReadFileSync.mockImplementation(() => {
                throw new Error('No such file or directory');
            });

            const stats = getProcessStats(1234);

            expect(stats).toBeNull();
        });
    });
});
