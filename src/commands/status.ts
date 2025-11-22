// Status Command - Phase 2
// Command: stint status

import { Command } from 'commander';

export function registerStatusCommand(program: Command): void {
    program
        .command('status')
        .description('Show linked project and connection status')
        .action(() => {
            throw new Error('Not implemented yet - Phase 2');
        });
}
