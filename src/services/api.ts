import {
    AgentSession,
    PendingCommit,
    Commit,
    RepoInfo,
    Project,
    User,
} from '../types/index.js';
import { config } from '../utils/config.js';
import { authService } from './auth.js';
import { logger } from '../utils/logger.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';

// Version is injected at build time via tsup define
const AGENT_VERSION = process.env.AGENT_VERSION || '0.0.0';

interface ApiPendingCommit {
    id: string;
    project_id?: string;
    projectId?: string;
    message: string;
    files?: string[];
    created_at?: string;
    createdAt?: string;
}

interface ApiCommit {
    id: string;
    project_id?: string;
    projectId?: string;
    message: string;
    sha?: string;
    status: 'pending' | 'executed' | 'failed';
    created_at?: string;
    createdAt?: string;
    executed_at?: string;
    executedAt?: string;
    error?: string;
}

class ApiServiceImpl {
    private sessionId: string | null = null;
    private circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000, // 30s before trying half-open
        windowSize: 60000, // 60s failure window
    });

    /**
     * Get authentication headers for API requests
     * @returns Headers object with Authorization and Content-Type
     * @throws Error if no authentication token is found
     */
    private async getHeaders(): Promise<Record<string, string>> {
        const token = await authService.getToken();
        if (!token) {
            throw new Error('No authentication token found. Please run "stint login" first.');
        }

        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Make an HTTP request to the API with circuit breaker protection
     * @param endpoint - API endpoint path (e.g., '/api/user')
     * @param options - Fetch options (method, body, headers, etc.)
     * @returns Parsed JSON response
     * @throws Error if request fails or circuit breaker is open
     */
    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${config.getApiUrl()}${endpoint}`;
        const headers = await this.getHeaders();

        return this.circuitBreaker.execute(async () => {
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
        });
    }

    /**
     * Retry wrapper with exponential backoff
     * @param operation - Async operation to retry
     * @param operationName - Name for logging
     * @param maxRetries - Maximum number of retry attempts (default: 3)
     * @returns Result of the operation
     * @throws Last error if all retries fail
     */
    private async withRetry<T>(
        operation: () => Promise<T>,
        operationName: string,
        maxRetries = 3
    ): Promise<T> {
        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;

                // Don't retry auth errors (401, 403)
                if (lastError.message.includes('401') || lastError.message.includes('403')) {
                    throw lastError;
                }

                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    logger.warn('api', `${operationName} failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    logger.error('api', `${operationName} failed after ${maxRetries} attempts`);
                }
            }
        }

        throw lastError!;
    }

    /**
     * Connect agent session to the API
     * @returns Agent session data including session ID
     * @throws Error if connection fails
     */
    async connect(): Promise<AgentSession> {
        logger.info('api', 'Connecting agent session...');

        const os = `${process.platform}-${process.arch}`;

        return this.withRetry(async () => {
            const response = await this.request<{ message: string; data: AgentSession }>('/api/agent/connect', {
                method: 'POST',
                body: JSON.stringify({
                    machine_id: authService.getMachineId(),
                    machine_name: authService.getMachineName(),
                    os: os,
                    agent_version: AGENT_VERSION,
                }),
            });

            const session = response.data;
            this.sessionId = session.id;
            logger.success('api', `Agent session connected: ${session.id}`);
            return session;
        }, 'Connect');
    }

    /**
     * Disconnect agent session from the API
     * @param reason - Optional reason for disconnection
     */
    async disconnect(reason?: string): Promise<void> {
        if (!this.sessionId) {
            return;
        }

        logger.info('api', 'Disconnecting agent session...');

        await this.request('/api/agent/disconnect', {
            method: 'POST',
            body: JSON.stringify({
                session_id: this.sessionId,
                reason: reason || 'Agent disconnected',
            }),
        });

        this.sessionId = null;
        logger.success('api', 'Agent session disconnected');
    }

    /**
     * Send heartbeat to keep session alive
     * @throws Error if no active session
     */
    async heartbeat(): Promise<void> {
        if (!this.sessionId) {
            throw new Error('No active session');
        }

        await this.withRetry(async () => {
            await this.request('/api/agent/heartbeat', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId,
                }),
            });
            logger.debug('api', 'Heartbeat sent');
        }, 'Heartbeat');
    }

    /**
     * Get pending commits for a project
     * @param projectId - Project ID
     * @returns Array of pending commits
     */
    async getPendingCommits(projectId: string): Promise<PendingCommit[]> {
        logger.info('api', `Fetching pending commits for project ${projectId}`);

        const response = await this.request<{ data: ApiPendingCommit[] }>(
            `/api/agent/pending-commits?project_id=${projectId}`
        );

        const commits: PendingCommit[] = response.data.map((item) => {
            const projectId = item.project_id || item.projectId;
            const createdAt = item.created_at || item.createdAt;

            if (!projectId || !createdAt) {
                throw new Error(`Invalid commit data received from API: ${JSON.stringify(item)}`);
            }

            return {
                id: item.id,
                projectId,
                message: item.message,
                files: item.files,
                createdAt,
            };
        });

        logger.info('api', `Found ${commits.length} pending commits`);
        return commits;
    }

    /**
     * Mark a commit as successfully executed
     * @param commitId - Commit ID
     * @param sha - Git commit SHA
     * @returns Updated commit data
     */
    async markCommitExecuted(commitId: string, sha: string): Promise<Commit> {
        logger.info('api', `Marking commit ${commitId} as executed (SHA: ${sha})`);

        return this.withRetry(async () => {
            const response = await this.request<{ data: ApiCommit }>(
                `/api/agent/commits/${commitId}/executed`,
                {
                    method: 'POST',
                    body: JSON.stringify({ sha }),
                }
            );
            const data = response.data;

            const projectId = data.project_id || data.projectId;
            const createdAt = data.created_at || data.createdAt;
            const executedAt = data.executed_at || data.executedAt;

            if (!projectId || !createdAt) {
                throw new Error(`Invalid commit data received from API: ${JSON.stringify(data)}`);
            }

            const commit: Commit = {
                id: data.id,
                projectId,
                message: data.message,
                sha: data.sha,
                status: data.status,
                createdAt,
                executedAt,
                error: data.error,
            };

            logger.success('api', `Commit ${commitId} marked as executed`);
            return commit;
        }, 'Mark commit executed');
    }

    /**
     * Mark a commit as failed
     * @param commitId - Commit ID
     * @param error - Error message
     */
    async markCommitFailed(commitId: string, error: string): Promise<void> {
        logger.error('api', `Marking commit ${commitId} as failed: ${error}`);

        await this.withRetry(async () => {
            await this.request(`/api/agent/commits/${commitId}/failed`, {
                method: 'POST',
                body: JSON.stringify({ error }),
            });
        }, 'Mark commit failed');
    }

    /**
     * Sync project repository information with the API
     * @param projectId - Project ID
     * @param data - Repository information (path, remote URL, branches)
     */
    async syncProject(projectId: string, data: RepoInfo): Promise<void> {
        logger.info('api', `Syncing project ${projectId}`);

        await this.withRetry(async () => {
            // Transform RepoInfo to match Laravel API's expected format
            const payload = {
                repo_path: data.repoPath,
                remote_url: data.remoteUrl,
                default_branch: data.defaultBranch,
                current_branch: data.currentBranch,
            };

            await this.request(`/api/agent/projects/${projectId}/sync`, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            logger.success('api', `Project ${projectId} synced`);
        }, 'Sync project');
    }

    /**
     * Test API connectivity
     */
    async ping(): Promise<void> {
        try {
            await this.request('/api/agent/ping');
        } catch (error) {
            throw new Error(`Failed to connect to API: ${(error as Error).message}`);
        }
    }

    async getLinkedProjects(): Promise<Project[]> {
        logger.info('api', 'Fetching linked projects');

        const response = await this.request<{ data: Project[] }>('/api/agent/projects');
        const projects = response.data;

        logger.info('api', `Found ${projects.length} linked projects`);
        return projects;
    }

    async getCurrentUser(): Promise<User> {
        logger.info('api', 'Fetching current user');

        const user = await this.request<User>('/api/user');

        logger.info('api', `Fetched user: ${user.email}`);
        return user;
    }

    async createProject(data: {
        name: string;
        description?: string;
        repo_path?: string;
        remote_url?: string;
        default_branch?: string;
    }): Promise<Project> {
        logger.info('api', `Creating project: ${data.name}`);

        const response = await this.request<{ data: Project }>('/api/agent/projects', {
            method: 'POST',
            body: JSON.stringify(data),
        });

        const project = response.data;
        logger.success('api', `Created project: ${project.name} (${project.id})`);
        return project;
    }
}

export const apiService = new ApiServiceImpl();
