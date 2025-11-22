// Commit Command - Phase 5
// Commands: stint commits, stint commit <id>

import { Command } from 'commander';

export function registerCommitCommands(program: Command): void {
    program
        .command('commits')
        .description('List pending commits for this repository')
        .action(() => {
            throw new Error('Not implemented yet - Phase 5');
        });

    program
        .command('commit <id>')
        .description('Execute a specific pending commit')
        .action(() => {
            throw new Error('Not implemented yet - Phase 5');
        });
}
