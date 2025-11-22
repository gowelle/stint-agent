// Git Service - Phase 2
// This service will handle all git operations using simple-git

import { RepoInfo, GitStatus, Branch } from '../types/index.js';

class GitServiceImpl {
    async isRepo(path: string): Promise<boolean> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented yet - Phase 2');
    }

    async getRepoInfo(path: string): Promise<RepoInfo> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented yet - Phase 2');
    }

    async stageAll(path: string): Promise<void> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented yet - Phase 2');
    }

    async stageFiles(path: string, files: string[]): Promise<void> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented yet - Phase 2');
    }

    async commit(path: string, message: string): Promise<string> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented yet - Phase 2');
    }

    async getCurrentBranch(path: string): Promise<string> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented yet - Phase 2');
    }

    async getBranches(path: string): Promise<Branch[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented yet - Phase 2');
    }

    async getStatus(path: string): Promise<GitStatus> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented yet - Phase 2');
    }
}

export const gitService = new GitServiceImpl();
