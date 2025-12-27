import os from 'os';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

interface ProcessStats {
    pid: number;
    cpuPercent: number;
    memoryMB: number;
    uptime: number;
    threads: number;
}

/**
 * Get process statistics (CPU, memory, etc.)
 * @param pid - Process ID to monitor
 * @returns Process statistics or null if unavailable
 */
export function getProcessStats(pid: number): ProcessStats | null {
    try {
        // Get process stats from /proc on Linux, ps on macOS, or wmic on Windows
        const platform = os.platform();

        if (platform === 'linux') {
            return getLinuxStats(pid);
        } else if (platform === 'darwin') {
            return getMacStats(pid);
        } else if (platform === 'win32') {
            return getWindowsStats(pid);
        }

        return null; // Unsupported platform
    } catch {
        // Stats may be temporarily unavailable (e.g., Windows perf counters not yet registered)
        return null;
    }
}

function getLinuxStats(pid: number): ProcessStats {
    // Read /proc/[pid]/stat for process info
    const statContent = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const statParts = statContent.split(' ');

    // Read /proc/[pid]/status for memory info
    const statusContent = readFileSync(`/proc/${pid}/status`, 'utf8');
    const vmRSS = parseInt(statusContent.match(/VmRSS:\s+(\d+)/)?.[1] || '0');

    // Read /proc/stat for CPU info
    readFileSync('/proc/stat', 'utf8'); // Read to ensure file exists

    // Process CPU time from stat
    const utime = parseInt(statParts[13]);
    const stime = parseInt(statParts[14]);
    const starttime = parseInt(statParts[21]);
    const threads = parseInt(statParts[19]);

    // Calculate CPU percentage
    const totalTime = utime + stime;
    const seconds = os.uptime() - (starttime / os.cpus().length);
    const cpuPercent = ((totalTime / seconds) * 100) / os.cpus().length;

    return {
        pid,
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryMB: Math.round(vmRSS / 1024 * 100) / 100,
        uptime: Math.round(seconds),
        threads,
    };
}

function getMacStats(pid: number): ProcessStats {

    // Get process info using ps
    const psOutput = execSync(`ps -p ${pid} -o %cpu,%mem,etime,thcount`).toString();
    const [cpu, mem, etime, threads] = psOutput.split('\n')[1].trim().split(/\s+/);

    // Parse elapsed time
    const uptimeSeconds = parseElapsedTime(etime);

    // Get total memory to convert percentage to MB
    const totalMem = os.totalmem() / (1024 * 1024); // Convert to MB
    const memoryMB = (parseFloat(mem) / 100) * totalMem;

    return {
        pid,
        cpuPercent: Math.round(parseFloat(cpu) * 100) / 100,
        memoryMB: Math.round(memoryMB * 100) / 100,
        uptime: uptimeSeconds,
        threads: parseInt(threads),
    };
}

function getWindowsStats(pid: number): ProcessStats {

    // Get process info using wmic
    const wmicOutput = execSync(
        `wmic path Win32_PerfFormattedData_PerfProc_Process WHERE IDProcess=${pid} get PercentProcessorTime,WorkingSetPrivate,ElapsedTime,ThreadCount /format:csv`
    ).toString();

    const [, , data] = wmicOutput.trim().split('\n');
    if (!data) {
        throw new Error(`Process ${pid} not found`);
    }

    const [, cpu, workingSet, elapsedTime, threads] = data.split(',');

    return {
        pid,
        cpuPercent: Math.round(parseInt(cpu) / os.cpus().length * 100) / 100,
        memoryMB: Math.round(parseInt(workingSet) / (1024 * 1024) * 100) / 100,
        uptime: Math.round(parseInt(elapsedTime) / 1000),
        threads: parseInt(threads),
    };
}

function parseElapsedTime(etime: string): number {
    const parts = etime.split('-');
    const timeStr = parts[parts.length - 1];
    const timeParts = timeStr.split(':');

    let seconds = 0;
    if (timeParts.length === 3) {
        seconds = parseInt(timeParts[0]) * 3600 + parseInt(timeParts[1]) * 60 + parseInt(timeParts[2]);
    } else if (timeParts.length === 2) {
        seconds = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
    } else {
        seconds = parseInt(timeParts[0]);
    }

    if (parts.length === 2) {
        seconds += parseInt(parts[0]) * 86400;
    }

    return seconds;
}
