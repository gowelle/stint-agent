import { Project, PendingCommit } from '../types/index.js';
import { apiService } from './api.js';
import { projectService } from './project.js';
import { logger } from '../utils/logger.js';

class PollingServiceImpl {
    private interval: NodeJS.Timeout | null = null;
    private knownCommitIds: Set<string> = new Set();
    private knownProjects: Map<string, Project> = new Map();
    private commitApprovedHandlers: ((commit: PendingCommit, project: Project) => void)[] = [];
    private projectUpdatedHandlers: ((project: Project) => void)[] = [];
    private isFirstRun = true;
    private isPolling = false;

    /**
     * Start polling for pending commits
     * @param intervalMs - Polling interval in milliseconds (default: 10000)
     */
    start(intervalMs = 10000): void {
        if (this.interval) {
            return;
        }

        logger.info('polling', `Starting polling service (interval: ${intervalMs}ms)`);

        // Run immediately
        this.poll();

        this.interval = setInterval(() => {
            this.poll();
        }, intervalMs);
    }

    /**
     * Stop polling
     */
    stop(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            logger.info('polling', 'Stopping polling service');
        }
    }

    /**
     * Register handler for commit approved event
     * @param handler - Function to call when a commit is approved where it was previously unknown
     */
    onCommitApproved(handler: (commit: PendingCommit, project: Project) => void): void {
        this.commitApprovedHandlers.push(handler);
    }

    /**
     * Register handler for project updated event
     * @param handler - Function to call when a project is updated
     */
    onProjectUpdated(handler: (project: Project) => void): void {
        this.projectUpdatedHandlers.push(handler);
    }

    /**
     * Poll for updates
     */
    private async poll(): Promise<void> {
        if (this.isPolling) {
            return;
        }

        this.isPolling = true;

        try {
            // Get all linked projects
            const linkedProjects = projectService.getAllLinkedProjects();
            const projectIds = Object.values(linkedProjects).map(p => p.projectId);

            if (projectIds.length === 0) {
                this.isFirstRun = false;
                this.isPolling = false;
                return;
            }

            // Also fetch project details to pass to handler if needed
            // We can get them from apiService.getLinkedProjects() which returns Project[]
            // But doing that every poll is expensive.
            // Let's rely on apiService.getPendingCommits returning what we need? 
            // It returns PendingCommit[].
            // We need the Project object for the notification (specifically the name).

            // Optimization: Get full project list once or cache it? 
            // For now, let's fetch pending commits. If we find a new one, THEN fetch project details if we don't have them.
            // But simply, let's fetch linked projects from API to get names.

            // Actually, let's just use what we have. API call to getLinkedProjects() is one call.
            // Fetch all projects from API (to get names/details) but filter to only those linked locally
            const apiProjects = await apiService.getLinkedProjects();
            const projects = apiProjects.filter(p => projectIds.includes(p.id));

            for (const project of projects) {
                // Check for project updates
                const cachedProject = this.knownProjects.get(project.id);
                if (cachedProject) {
                    if (cachedProject.updatedAt !== project.updatedAt) {
                        if (!this.isFirstRun) {
                            logger.info('polling', `Project update detected: ${project.id}`);
                            this.notifyProjectUpdated(project);
                        }
                    }
                }
                this.knownProjects.set(project.id, project);

                try {
                    const commits = await apiService.getPendingCommits(project.id);

                    for (const commit of commits) {
                        if (!this.knownCommitIds.has(commit.id)) {
                            this.knownCommitIds.add(commit.id);

                            // Only notify if this is not the first run (initial population)
                            if (!this.isFirstRun) {
                                logger.info('polling', `New pending commit detected: ${commit.id}`);
                                this.notifyCommitApproved(commit, project);
                            }
                        }
                    }
                } catch (error) {
                    // Ignore errors for individual projects to keep polling others
                    logger.debug('polling', `Failed to poll project ${project.id}: ${(error as Error).message}`);
                }
            }

            this.isFirstRun = false;

        } catch (error) {
            logger.error('polling', 'Poll cycle failed', error as Error);
        } finally {
            this.isPolling = false;
        }
    }

    private notifyCommitApproved(commit: PendingCommit, project: Project): void {
        this.commitApprovedHandlers.forEach(handler => {
            try {
                handler(commit, project);
            } catch (error) {
                logger.error('polling', 'Error in commit approved handler', error as Error);
            }
        });
    }

    private notifyProjectUpdated(project: Project): void {
        this.projectUpdatedHandlers.forEach(handler => {
            try {
                handler(project);
            } catch (error) {
                logger.error('polling', 'Error in project updated handler', error as Error);
            }
        });
    }
}

export const pollingService = new PollingServiceImpl();
