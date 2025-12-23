// This service handles all git operations using simple-git

import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import { RepoInfo, GitStatus, Branch } from '../types/index.js';
import { logger } from '../utils/logger.js';

class GitServiceImpl {
    private getGit(path: string): SimpleGit {
        return simpleGit(path);
    }

    async isRepo(path: string): Promise<boolean> {
        try {
            const git = this.getGit(path);
            return await git.checkIsRepo();
        } catch (error) {
            logger.error('git', `Failed to check if ${path} is a repo`, error as Error);
            return false;
        }
    }

    async getRepoInfo(path: string): Promise<RepoInfo> {
        try {
            const git = this.getGit(path);

            // Get current branch
            const branchSummary = await git.branch();
            const currentBranch = branchSummary.current;

            // Get all branches
            const branches = branchSummary.all;

            // Get remote URL
            const remotes = await git.getRemotes(true);
            const remoteUrl = remotes.length > 0 ? remotes[0].refs.fetch : null;

            // Get default branch (what origin/HEAD points to)
            let defaultBranch = currentBranch; // fallback to current branch
            try {
                // Try to get the remote's default branch by checking origin/HEAD
                const result = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
                const match = result.trim().match(/refs\/remotes\/origin\/(.+)/);
                if (match) {
                    defaultBranch = match[1];
                }
            } catch {
                // If origin/HEAD doesn't exist, try common defaults
                if (branches.includes('main')) {
                    defaultBranch = 'main';
                } else if (branches.includes('master')) {
                    defaultBranch = 'master';
                }
                // Otherwise keep currentBranch as default
            }

            // Get status
            const status = await this.getStatus(path);

            // Get last commit info
            const log = await git.log({ maxCount: 1 });
            const lastCommit = log.latest;

            if (!lastCommit) {
                throw new Error('No commits found in repository');
            }

            return {
                repoPath: path,
                currentBranch,
                defaultBranch,
                branches,
                remoteUrl,
                status,
                lastCommitSha: lastCommit.hash,
                lastCommitMessage: lastCommit.message,
                lastCommitDate: lastCommit.date,
            };
        } catch (error) {
            logger.error('git', `Failed to get repo info for ${path}`, error as Error);
            throw new Error(`Failed to get repository information: ${(error as Error).message}`);
        }
    }

    async stageAll(path: string): Promise<void> {
        try {
            const git = this.getGit(path);
            await git.add('.');
            logger.info('git', `Staged all changes in ${path}`);
        } catch (error) {
            logger.error('git', `Failed to stage all in ${path}`, error as Error);
            throw new Error(`Failed to stage changes: ${(error as Error).message}`);
        }
    }

    async stageFiles(path: string, files: string[]): Promise<void> {
        try {
            const git = this.getGit(path);
            await git.add(files);
            logger.info('git', `Staged ${files.length} files in ${path}`);
        } catch (error) {
            logger.error('git', `Failed to stage files in ${path}`, error as Error);
            throw new Error(`Failed to stage files: ${(error as Error).message}`);
        }
    }

    async commit(path: string, message: string): Promise<string> {
        try {
            const git = this.getGit(path);
            const result = await git.commit(message);
            const sha = result.commit;
            logger.success('git', `Created commit ${sha} in ${path}`);
            return sha;
        } catch (error) {
            logger.error('git', `Failed to commit in ${path}`, error as Error);
            throw new Error(`Failed to create commit: ${(error as Error).message}`);
        }
    }

    async getCurrentBranch(path: string): Promise<string> {
        try {
            const git = this.getGit(path);
            const branchSummary = await git.branch();
            return branchSummary.current;
        } catch (error) {
            logger.error('git', `Failed to get current branch in ${path}`, error as Error);
            throw new Error(`Failed to get current branch: ${(error as Error).message}`);
        }
    }

    async getBranches(path: string): Promise<Branch[]> {
        try {
            const git = this.getGit(path);
            const branchSummary = await git.branch();

            return branchSummary.all.map((name) => ({
                name,
                current: name === branchSummary.current,
                commit: branchSummary.branches[name]?.commit || '',
            }));
        } catch (error) {
            logger.error('git', `Failed to get branches in ${path}`, error as Error);
            throw new Error(`Failed to get branches: ${(error as Error).message}`);
        }
    }

    async getStatus(path: string): Promise<GitStatus> {
        try {
            const git = this.getGit(path);
            const status: StatusResult = await git.status();

            return {
                staged: status.staged,
                unstaged: status.modified.concat(status.deleted),
                untracked: status.not_added,
                ahead: status.ahead,
                behind: status.behind,
            };
        } catch (error) {
            logger.error('git', `Failed to get status in ${path}`, error as Error);
            throw new Error(`Failed to get git status: ${(error as Error).message}`);
        }
    }
}

export const gitService = new GitServiceImpl();
