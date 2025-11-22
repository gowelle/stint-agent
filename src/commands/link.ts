// Link Command - Phase 2
// Command: stint link

import { Command } from 'commander';

export function registerLinkCommand(program: Command): void {
    program
        .command('link')
        .description('Link current directory to a Stint project')
        .action(() => {
            throw new Error('Not implemented yet - Phase 2');
        });
}
