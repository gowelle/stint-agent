import fs from 'fs';
import { projectService } from '../services/project.js';
import { gitService } from '../services/git.js';
import { apiService } from '../services/api.js';
import { logger } from '../utils/logger.js';

interface WatcherInfo {
    watcher: fs.FSWatcher;
    debounceTimer: NodeJS.Timeout | null;
    projectId: string;
}

export class FileWatcher {
    private watchers: Map<string, WatcherInfo> = new Map();
    private readonly DEBOUNCE_DELAY = 3000; // 3 seconds
    private readonly IGNORE_PATTERNS = [
        '.git',
        'node_modules',
        'dist',
        'build',
        '.next',
        '.cache',
        '.turbo',
        '.vscode',
        '.idea',
        'coverage',
        '.nyc_output',
        '*.log',
    ];

    /**
     * Start watching all linked projects
     */
    start(): void {
        logger.info('watcher', 'Starting file watcher...');

        const linkedProjects = projectService.getAllLinkedProjects();

        if (Object.keys(linkedProjects).length === 0) {
            logger.info('watcher', 'No linked projects to watch');
            return;
        }

        for (const [projectPath, linkedProject] of Object.entries(linkedProjects)) {
            this.watchProject(projectPath, linkedProject.projectId);
        }

        logger.success('watcher', `Watching ${this.watchers.size} project(s)`);
    }

    /**
     * Start watching a specific project path
     */
    private watchProject(projectPath: string, projectId: string): void {
        // Skip if already watching
        if (this.watchers.has(projectPath)) {
            logger.debug('watcher', `Already watching ${projectPath}`);
            return;
        }

        try {
            // Verify path exists
            if (!fs.existsSync(projectPath)) {
                logger.warn('watcher', `Project path does not exist: ${projectPath}`);
                return;
            }

            // Create watcher
            const watcher = fs.watch(projectPath, { recursive: true }, (eventType, filename) => {
                if (!filename) return;

                // Convert filename to string if it's a Buffer (Node.js fs.watch can return Buffer)
                const filenameStr = Buffer.isBuffer(filename) ? filename.toString('utf8') : filename;

                // Check if file should be ignored
                if (this.shouldIgnore(filenameStr)) {
                    return;
                }

                logger.debug('watcher', `File change detected: ${filenameStr} (${eventType}) in ${projectPath}`);

                // Debounce sync operation
                this.debounceSync(projectPath, projectId);
            });

            // Handle watcher errors to prevent unhandled errors from crashing the daemon
            watcher.on('error', (error) => {
                logger.error('watcher', `Watcher error for ${projectPath}`, error);
                // Remove the watcher from the map since it's in an error state
                const watcherInfo = this.watchers.get(projectPath);
                if (watcherInfo) {
                    if (watcherInfo.debounceTimer) {
                        clearTimeout(watcherInfo.debounceTimer);
                    }
                    this.watchers.delete(projectPath);
                }
            });

            // Store watcher info
            this.watchers.set(projectPath, {
                watcher,
                debounceTimer: null,
                projectId,
            });

            logger.info('watcher', `Started watching: ${projectPath} (project: ${projectId})`);
        } catch (error) {
            logger.error('watcher', `Failed to watch ${projectPath}`, error as Error);
        }
    }

    /**
     * Check if a file path should be ignored
     */
    private shouldIgnore(filePath: string): boolean {
        const normalizedPath = filePath.replace(/\\/g, '/');
        // Extract filename from path for pattern matching
        const filename = normalizedPath.split('/').pop() || normalizedPath;

        for (const pattern of this.IGNORE_PATTERNS) {
            // Handle wildcard patterns
            if (pattern.includes('*')) {
                // Escape all special regex characters except *
                let escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

                // Replace * with .* (match any characters)
                escapedPattern = escapedPattern.replace(/\*/g, '.*');

                // Anchor the pattern based on wildcard position for proper glob matching
                let regexPattern: string;
                if (pattern.startsWith('*') && pattern.endsWith('*')) {
                    // Pattern like *middle* - match anywhere in filename
                    regexPattern = `^${escapedPattern}$`;
                } else if (pattern.startsWith('*')) {
                    // Pattern like *.log - match only at end of filename
                    regexPattern = `^${escapedPattern}$`;
                } else if (pattern.endsWith('*')) {
                    // Pattern like test* - match only at start of filename
                    regexPattern = `^${escapedPattern}$`;
                } else {
                    // Pattern with * in middle - match entire filename
                    regexPattern = `^${escapedPattern}$`;
                }

                const regex = new RegExp(regexPattern);
                if (regex.test(filename)) {
                    return true;
                }
            } else {
                // Check if path contains the ignore pattern
                if (normalizedPath.includes(pattern)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Debounce sync operation for a project
     */
    private debounceSync(projectPath: string, projectId: string): void {
        const watcherInfo = this.watchers.get(projectPath);
        if (!watcherInfo) return;

        // Clear existing timer
        if (watcherInfo.debounceTimer) {
            clearTimeout(watcherInfo.debounceTimer);
        }

        // Set new timer
        watcherInfo.debounceTimer = setTimeout(async () => {
            try {
                await this.performSync(projectPath, projectId);
            } catch (error) {
                logger.error('watcher', `Sync failed for ${projectPath}`, error as Error);
            } finally {
                watcherInfo.debounceTimer = null;
            }
        }, this.DEBOUNCE_DELAY);
    }

    /**
     * Perform sync operation for a project
     */
    private async performSync(projectPath: string, projectId: string): Promise<void> {
        logger.info('watcher', `Syncing project ${projectId} (${projectPath})`);

        try {
            // Verify it's still a git repository
            const isRepo = await gitService.isRepo(projectPath);
            if (!isRepo) {
                logger.warn('watcher', `Project ${projectPath} is no longer a git repository`);
                return;
            }

            // Get repository information
            const repoInfo = await gitService.getRepoInfo(projectPath);

            // Sync with API
            await apiService.syncProject(projectId, repoInfo);

            logger.success('watcher', `Synced project ${projectId}`);
        } catch (error) {
            logger.error('watcher', `Failed to sync project ${projectId}`, error as Error);
            // Don't throw - we want to continue watching even if sync fails
        }
    }

    /**
     * Stop watching all projects
     */
    stop(): void {
        logger.info('watcher', 'Stopping file watcher...');

        for (const [projectPath, watcherInfo] of this.watchers.entries()) {
            try {
                // Clear debounce timer
                if (watcherInfo.debounceTimer) {
                    clearTimeout(watcherInfo.debounceTimer);
                }

                // Close watcher
                watcherInfo.watcher.close();

                logger.debug('watcher', `Stopped watching: ${projectPath}`);
            } catch (error) {
                logger.error('watcher', `Error stopping watcher for ${projectPath}`, error as Error);
            }
        }

        this.watchers.clear();
        logger.success('watcher', 'File watcher stopped');
    }

    /**
     * Add a new project to watch (called when a project is linked)
     */
    addProject(projectPath: string, projectId: string): void {
        this.watchProject(projectPath, projectId);
    }

    /**
     * Sync a project by ID (called when server requests a sync)
     */
    async syncProjectById(projectId: string): Promise<void> {
        // Find the project path from linked projects
        const linkedProjects = projectService.getAllLinkedProjects();

        for (const [projectPath, linkedProject] of Object.entries(linkedProjects)) {
            if (linkedProject.projectId === projectId) {
                await this.performSync(projectPath, projectId);
                return;
            }
        }

        logger.warn('watcher', `Cannot sync: project ${projectId} not found in linked projects`);
    }

    /**
     * Remove a project from watching (called when a project is unlinked)
     */
    removeProject(projectPath: string): void {
        const watcherInfo = this.watchers.get(projectPath);
        if (!watcherInfo) return;

        try {
            // Clear debounce timer
            if (watcherInfo.debounceTimer) {
                clearTimeout(watcherInfo.debounceTimer);
            }

            // Close watcher
            watcherInfo.watcher.close();

            // Remove from map
            this.watchers.delete(projectPath);

            logger.info('watcher', `Stopped watching: ${projectPath}`);
        } catch (error) {
            logger.error('watcher', `Error removing watcher for ${projectPath}`, error as Error);
        }
    }
}
