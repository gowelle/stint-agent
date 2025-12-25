import { gitService } from '../services/git.js';
import { apiService } from '../services/api.js';
import { projectService } from '../services/project.js';
import { logger } from '../utils/logger.js';
import { PendingCommit, Project } from '../types/index.js';

interface QueueItem {
    commit: PendingCommit;
    project: Project;
}

class CommitQueueProcessor {
    private queue: QueueItem[] = [];
    private isProcessing = false;

    /**
     * Add commit to processing queue
     */
    addToQueue(commit: PendingCommit, project: Project): void {
        this.queue.push({ commit, project });
        logger.info('queue', `Added commit ${commit.id} to queue (position: ${this.queue.length})`);

        // Start processing if not already running
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    /**
     * Process commits sequentially
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();
            if (!item) break;

            try {
                await this.executeCommit(item.commit, item.project);
            } catch (error) {
                logger.error('queue', `Failed to execute commit ${item.commit.id}`, error as Error);
            }
        }

        this.isProcessing = false;
    }

    /**
     * Execute a single commit
     */
    async executeCommit(commit: PendingCommit, project: Project, onProgress?: (stage: string) => void, options?: { push?: boolean }): Promise<string> {
        logger.info('queue', `Processing commit: ${commit.id} - ${commit.message}`);

        try {
            onProgress?.('Finding project directory...');
            const projectPath = this.findProjectPath(project.id);
            if (!projectPath) {
                throw new Error(`Project ${project.id} is not linked to any local directory`);
            }

            logger.info('queue', `Executing in directory: ${projectPath}`);

            onProgress?.('Validating repository...');
            const isRepo = await gitService.isRepo(projectPath);
            if (!isRepo) {
                throw new Error(`Directory ${projectPath} is not a git repository`);
            }

            onProgress?.('Checking repository status...');
            let status = await gitService.getStatus(projectPath);

            // Auto-stage files if specified in commit, otherwise stage all changes
            if (commit.files && commit.files.length > 0) {
                onProgress?.(`Staging ${commit.files.length} specified files...`);
                await gitService.stageFiles(projectPath, commit.files);
                status = await gitService.getStatus(projectPath);
                logger.info('queue', `Auto-staged files: ${commit.files.join(', ')}`);
            } else if (status.staged.length === 0) {
                // No specific files specified and nothing staged - check for unstaged/untracked changes
                const hasChanges = status.unstaged.length > 0 || status.untracked.length > 0;
                if (hasChanges) {
                    onProgress?.('Staging all changes...');
                    await gitService.stageAll(projectPath);
                    status = await gitService.getStatus(projectPath);
                    logger.info('queue', `Auto-staged all changes`);
                }
            }

            if (status.staged.length === 0) {
                throw new Error('No changes to commit. The working directory is clean.');
            }

            logger.info('queue', `Committing ${status.staged.length} staged files.`);

            onProgress?.('Creating commit...');
            logger.info('queue', `Creating commit with message: "${commit.message}"`);
            const sha = await gitService.commit(projectPath, commit.message);

            logger.success('queue', `Commit created successfully: ${sha}`);

            // Push to remote if requested
            if (options?.push) {
                onProgress?.('Pushing to remote...');
                await gitService.push(projectPath);
                logger.success('queue', `Pushed commit ${sha} to remote`);
            }

            onProgress?.('Reporting to server...');
            await this.reportSuccess(commit.id, sha);

            return sha;
        } catch (error) {
            const errorMessage = (error as Error).message;
            logger.error('queue', `Commit execution failed: ${errorMessage}`);

            // Report failure to API
            await this.reportFailure(commit.id, errorMessage);

            throw error;
        }
    }

    /**
     * Report successful execution to API
     */
    private async reportSuccess(commitId: string, sha: string): Promise<void> {
        try {
            await apiService.markCommitExecuted(commitId, sha);
            logger.success('queue', `Reported commit execution to API: ${commitId} -> ${sha}`);
        } catch (error) {
            logger.error('queue', 'Failed to report commit success to API', error as Error);
            // Don't throw - commit was successful locally
        }
    }

    /**
     * Report failed execution to API
     */
    private async reportFailure(commitId: string, error: string): Promise<void> {
        try {
            await apiService.markCommitFailed(commitId, error);
            logger.info('queue', `Reported commit failure to API: ${commitId}`);
        } catch (apiError) {
            logger.error('queue', 'Failed to report commit failure to API', apiError as Error);
            // Don't throw - we already have an error
        }
    }

    /**
     * Find local path for a project ID
     */
    private findProjectPath(projectId: string): string | null {
        const allProjects = projectService.getAllLinkedProjects();

        for (const [path, linkedProject] of Object.entries(allProjects)) {
            if (linkedProject.projectId === projectId) {
                return path;
            }
        }

        return null;
    }

    /**
     * Check if queue is currently processing
     */
    isCurrentlyProcessing(): boolean {
        return this.isProcessing;
    }

    /**
     * Get queue length
     */
    getQueueLength(): number {
        return this.queue.length;
    }
}

export const commitQueue = new CommitQueueProcessor();
