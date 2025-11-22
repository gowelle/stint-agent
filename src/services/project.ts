// Project Service - Phase 2
// This service will handle project linking and management

import { LinkedProject } from '../types/index.js';

class ProjectServiceImpl {
    async linkProject(path: string, projectId: string): Promise<void> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented yet - Phase 2');
    }

    async unlinkProject(path: string): Promise<void> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented yet - Phase 2');
    }

    getLinkedProject(path: string): LinkedProject | null {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented yet - Phase 2');
    }

    getAllLinkedProjects(): Record<string, LinkedProject> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented yet - Phase 2');
    }
}

export const projectService = new ProjectServiceImpl();
