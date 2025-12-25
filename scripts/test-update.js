#!/usr/bin/env node
// Cross-platform test runner for stint-agent update process

import { exec, ExecException } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

interface ExecResult {
    stdout: string;
    stderr: string;
}

const execAsync = promisify<string, ExecResult>(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

const INITIAL_VERSION = process.argv[2] || '1.0.0';
const TARGET_VERSION = process.argv[3] || 'latest';

async function runTest(): Promise<void> {
    const os = platform();
    console.log(`🚀 Running update tests on ${os}`);
    console.log(`Initial version: ${INITIAL_VERSION}`);
    console.log(`Target version: ${TARGET_VERSION}\n`);

    try {
        if (os === 'win32') {
            const scriptPath = join(__dirname, 'test-update-windows.ps1');
            await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}" -InitialVersion ${INITIAL_VERSION} -TargetVersion ${TARGET_VERSION}`);
        } else {
            const scriptPath = join(__dirname, 'test-update-unix.sh');
            await execAsync(`bash "${scriptPath}" ${INITIAL_VERSION} ${TARGET_VERSION}`);
        }

        console.log('\n✨ All tests completed successfully');
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.stdout) console.log('stdout:', error.stdout);
        if (error.stderr) console.log('stderr:', error.stderr);
        process.exit(1);
    }
}

runTest().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
