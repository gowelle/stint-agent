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

            // Validate it's a git repository
            const isRepo = await gitService.isRepo(absolutePath);
            if (!isRepo) {
                throw new Error(`${absolutePath} is not a git repository`);
            }

            // Create linked project object
            const linkedProject: LinkedProject = {
                projectId,
                linkedAt: new Date().toISOString(),
            };

            // Save to config
            config.setProject(absolutePath, linkedProject);

            logger.success('project', `Linked ${absolutePath} to project ${projectId}`);
        } catch (error) {
            logger.error('project', 'Failed to link project', error as Error);
            throw error;
        }
    }

    async unlinkProject(projectPath: string): Promise<void> {
        try {
            const absolutePath = path.resolve(projectPath);

            // Check if project exists
            const linkedProject = this.getLinkedProject(absolutePath);
            if (!linkedProject) {
                throw new Error(`${absolutePath} is not linked to any project`);
            }

            // Remove from config
            config.removeProject(absolutePath);

            logger.success('project', `Unlinked ${absolutePath}`);
        } catch (error) {
            logger.error('project', 'Failed to unlink project', error as Error);
            throw error;
        }
    }

    getLinkedProject(projectPath: string): LinkedProject | null {
        const absolutePath = path.resolve(projectPath);
        return config.getProject(absolutePath) || null;
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
