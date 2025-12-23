import { LinkedProject } from '../types/index.js';
import { config } from '../utils/config.js';
import { gitService } from './git.js';
import { logger } from '../utils/logger.js';
import path from 'path';

class ProjectServiceImpl {
    async linkProject(projectPath: string, projectId: string): Promise<void> {
        try {
            // Ensure path is absolute
            const absolutePath = path.resolve(projectPath);

            // Get repo root to link against the root instead of a subdir
            const repoRoot = await gitService.getRepoRoot(absolutePath);
            const linkPath = repoRoot || absolutePath;

            // Validate it's a git repository (if we didn't get root, we double check isRepo)
            if (!repoRoot) {
                const isRepo = await gitService.isRepo(absolutePath);
                if (!isRepo) {
                    throw new Error(`${absolutePath} is not a git repository`);
                }
            }

            // Create linked project object
            const linkedProject: LinkedProject = {
                projectId,
                linkedAt: new Date().toISOString(),
            };

            // Save to config
            config.setProject(linkPath, linkedProject);

            logger.success('project', `Linked ${linkPath} must be to project ${projectId}`);
        } catch (error) {
            logger.error('project', 'Failed to link project', error as Error);
            throw error;
        }
    }

    async unlinkProject(projectPath: string): Promise<void> {
        try {
            const absolutePath = path.resolve(projectPath);

            // Check if project exists (resolve root first)
            const repoRoot = await gitService.getRepoRoot(absolutePath);
            const lookupPath = repoRoot || absolutePath;

            const linkedProject = config.getProject(lookupPath);
            if (!linkedProject) {
                throw new Error(`${absolutePath} is not linked to any project`);
            }

            // Remove from config
            config.removeProject(lookupPath);

            logger.success('project', `Unlinked ${lookupPath}`);
        } catch (error) {
            logger.error('project', 'Failed to unlink project', error as Error);
            throw error;
        }
    }

    async getLinkedProject(projectPath: string): Promise<LinkedProject | null> {
        const absolutePath = path.resolve(projectPath);

        // 1. Check exact match first (legacy support or non-git folders)
        let project = config.getProject(absolutePath);
        if (project) return project;

        // 2. Resolve git root and check that
        const repoRoot = await gitService.getRepoRoot(absolutePath);
        if (repoRoot) {
            project = config.getProject(repoRoot);
            if (project) return project;
        }

        return null;
    }

    getAllLinkedProjects(): Record<string, LinkedProject> {
        return config.getProjects();
    }

    /**
     * Get local path for a project ID
     */
    getProjectPath(projectId: string): string | null {
        const allProjects = this.getAllLinkedProjects();

        for (const [path, linkedProject] of Object.entries(allProjects)) {
            if (linkedProject.projectId === projectId) {
                return path;
            }
        }

        return null;
    }
}

export const projectService = new ProjectServiceImpl();
