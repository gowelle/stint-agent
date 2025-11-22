// Sync Command - Phase 2
// Command: stint sync

import { Command } from 'commander';

export function registerSyncCommand(program: Command): void {
    program
        .command('sync')
        .description('Manually sync repository information to server')
        .action(() => {
            throw new Error('Not implemented yet - Phase 2');
        });
}
