import {
    AgentSession,
    PendingCommit,
    Commit,
    RepoInfo,
    Project,
} from '../types/index.js';
import { config } from '../utils/config.js';
import { authService } from './auth.js';
import { logger } from '../utils/logger.js';

class ApiServiceImpl {
    private sessionId: string | null = null;

    private async getHeaders(): Promise<HeadersInit> {
        const token = await authService.getToken();
        if (!token) {
            throw new Error('No authentication token found. Please run "stint login" first.');
        }

        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${config.getApiUrl()}${endpoint}`;
        const headers = await this.getHeaders();

        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...headers,
                    ...options.headers,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${errorText}`);
            }

            return await response.json() as T;
        } catch (error) {
            logger.error('api', `Request to ${endpoint} failed`, error as Error);
            throw error;
        }
    }

    async connect(): Promise<AgentSession> {
        logger.info('api', 'Connecting agent session...');

        const session = await this.request<AgentSession>('/api/agent/connect', {
            method: 'POST',
            body: JSON.stringify({
                machineId: authService.getMachineId(),
                machineName: authService.getMachineName(),
            }),
        });

        this.sessionId = session.id;
        logger.success('api', `Agent session connected: ${session.id}`);
        return session;
    }

    async disconnect(): Promise<void> {
        if (!this.sessionId) {
            return;
        }

        logger.info('api', 'Disconnecting agent session...');

        await this.request('/api/agent/disconnect', {
            method: 'POST',
        });

        this.sessionId = null;
        logger.success('api', 'Agent session disconnected');
    }

    async heartbeat(): Promise<void> {
        if (!this.sessionId) {
            throw new Error('No active session');
        }

        await this.request('/api/agent/heartbeat', {
            method: 'POST',
        });

        logger.debug('api', 'Heartbeat sent');
    }

    async getPendingCommits(projectId: string): Promise<PendingCommit[]> {
        logger.info('api', `Fetching pending commits for project ${projectId}`);

        const commits = await this.request<PendingCommit[]>(
            `/api/agent/projects/${projectId}/pending-commits`
        );

        logger.info('api', `Found ${commits.length} pending commits`);
        return commits;
    }

    async markCommitExecuted(commitId: string, sha: string): Promise<Commit> {
        logger.info('api', `Marking commit ${commitId} as executed (SHA: ${sha})`);

        const commit = await this.request<Commit>(
            `/api/agent/commits/${commitId}/executed`,
            {
                method: 'POST',
                body: JSON.stringify({ sha }),
            }
        );

        logger.success('api', `Commit ${commitId} marked as executed`);
        return commit;
    }

    async markCommitFailed(commitId: string, error: string): Promise<void> {
        logger.error('api', `Marking commit ${commitId} as failed: ${error}`);

        await this.request(`/api/agent/commits/${commitId}/failed`, {
            method: 'POST',
            body: JSON.stringify({ error }),
        });
    }

    async syncProject(projectId: string, data: RepoInfo): Promise<void> {
        logger.info('api', `Syncing project ${projectId}`);

        await this.request(`/api/agent/projects/${projectId}/sync`, {
            method: 'POST',
            body: JSON.stringify(data),
        });

        logger.success('api', `Project ${projectId} synced`);
    }

    async getLinkedProjects(): Promise<Project[]> {
        logger.info('api', 'Fetching linked projects');

        const projects = await this.request<Project[]>('/api/agent/projects');

        logger.info('api', `Found ${projects.length} linked projects`);
        return projects;
    }
}

export const apiService = new ApiServiceImpl();
