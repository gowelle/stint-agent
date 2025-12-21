import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../utils/config.js', () => ({
    config: {
        getApiUrl: vi.fn(() => 'https://api.stint.test'),
    },
}));

vi.mock('./auth.js', () => ({
    authService: {
        getToken: vi.fn(),
        getMachineId: vi.fn(() => 'test-machine-id'),
        getMachineName: vi.fn(() => 'test-machine'),
    },
}));

vi.mock('../utils/logger.js', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
    },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ApiService', () => {
    let apiService: typeof import('./api.js').apiService;
    let authService: typeof import('./auth.js').authService;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();

        // Re-import modules
        const authModule = await import('./auth.js');
        const apiModule = await import('./api.js');

        authService = authModule.authService;
        apiService = apiModule.apiService;

        // Set up default mock returns
        (authService.getToken as Mock).mockResolvedValue('test-token');
        mockFetch.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getHeaders', () => {
        it('should throw error when no token available', async () => {
            (authService.getToken as Mock).mockResolvedValue(null);

            await expect(apiService.connect()).rejects.toThrow(
                'No authentication token found'
            );
        });
    });

    describe('connect', () => {
        it('should send correct payload with machine info', async () => {
            const mockSession = {
                id: 'session-123',
                machineId: 'test-machine-id',
                machineName: 'test-machine',
                connectedAt: '2024-01-01T00:00:00Z',
                lastHeartbeat: '2024-01-01T00:00:00Z',
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ message: 'Connected', data: mockSession }),
            });

            const session = await apiService.connect();

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.stint.test/api/agent/connect',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        Authorization: 'Bearer test-token',
                        'Content-Type': 'application/json',
                    }),
                })
            );

            // Verify payload structure
            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(callBody).toHaveProperty('machine_id', 'test-machine-id');
            expect(callBody).toHaveProperty('machine_name', 'test-machine');
            expect(callBody).toHaveProperty('os');
            expect(callBody).toHaveProperty('agent_version');

            expect(session).toEqual(mockSession);
        });

        it('should retry on network failure with backoff', async () => {
            const mockSession = {
                id: 'session-123',
                machineId: 'test-machine-id',
                machineName: 'test-machine',
                connectedAt: '2024-01-01T00:00:00Z',
                lastHeartbeat: '2024-01-01T00:00:00Z',
            };

            // Fail first two times, succeed third time
            mockFetch
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve({ message: 'Connected', data: mockSession }),
                });

            const session = await apiService.connect();

            expect(mockFetch).toHaveBeenCalledTimes(3);
            expect(session).toEqual(mockSession);
        });

        it('should not retry on 401 auth error', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 401,
                text: () => Promise.resolve('Unauthorized'),
            });

            await expect(apiService.connect()).rejects.toThrow('401');
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('should not retry on 403 forbidden error', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 403,
                text: () => Promise.resolve('Forbidden'),
            });

            await expect(apiService.connect()).rejects.toThrow('403');
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('disconnect', () => {
        it('should do nothing if no active session', async () => {
            await apiService.disconnect();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should disconnect active session', async () => {
            // First connect
            const mockSession = { id: 'session-123', machineId: 'test', machineName: 'test', connectedAt: '', lastHeartbeat: '' };
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ message: 'Connected', data: mockSession }),
            });
            await apiService.connect();

            mockFetch.mockClear();
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            await apiService.disconnect();

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.stint.test/api/agent/disconnect',
                expect.objectContaining({
                    method: 'POST',
                })
            );
        });
    });

    describe('heartbeat', () => {
        it('should throw error if no active session', async () => {
            await expect(apiService.heartbeat()).rejects.toThrow('No active session');
        });

        it('should send heartbeat with session id', async () => {
            // First connect
            const mockSession = { id: 'session-123', machineId: 'test', machineName: 'test', connectedAt: '', lastHeartbeat: '' };
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ message: 'Connected', data: mockSession }),
            });
            await apiService.connect();

            mockFetch.mockClear();
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            await apiService.heartbeat();

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.stint.test/api/agent/heartbeat',
                expect.objectContaining({
                    method: 'POST',
                })
            );

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(callBody).toHaveProperty('session_id', 'session-123');
        });
    });

    describe('getPendingCommits', () => {
        it('should fetch pending commits for project', async () => {
            const mockCommits = [
                { id: 'commit-1', projectId: 'proj-1', message: 'Test commit', createdAt: '' },
            ];

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: mockCommits }),
            });

            const commits = await apiService.getPendingCommits('proj-1');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.stint.test/api/agent/pending-commits?project_id=proj-1',
                expect.any(Object)
            );
            expect(commits).toEqual(mockCommits);
        });
    });

    describe('markCommitExecuted', () => {
        it('should mark commit as executed with sha', async () => {
            const mockCommit = { id: 'commit-1', projectId: 'proj-1', message: 'Test', status: 'executed', sha: 'abc123', createdAt: '' };

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: mockCommit }),
            });

            const commit = await apiService.markCommitExecuted('commit-1', 'abc123');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.stint.test/api/agent/commits/commit-1/executed',
                expect.objectContaining({
                    method: 'POST',
                })
            );

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(callBody).toHaveProperty('sha', 'abc123');
            expect(commit).toEqual(mockCommit);
        });
    });

    describe('markCommitFailed', () => {
        it('should mark commit as failed with error', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            await apiService.markCommitFailed('commit-1', 'Git error occurred');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.stint.test/api/agent/commits/commit-1/failed',
                expect.objectContaining({
                    method: 'POST',
                })
            );

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(callBody).toHaveProperty('error', 'Git error occurred');
        });
    });

    describe('syncProject', () => {
        it('should sync project with repo info', async () => {
            const repoInfo = {
                currentBranch: 'main',
                branches: ['main', 'develop'],
                remoteUrl: 'https://github.com/test/repo.git',
                status: { staged: [], unstaged: [], untracked: [], ahead: 0, behind: 0 },
                lastCommitSha: 'abc123',
                lastCommitMessage: 'Initial commit',
                lastCommitDate: '2024-01-01T00:00:00Z',
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            await apiService.syncProject('proj-1', repoInfo);

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.stint.test/api/agent/projects/proj-1/sync',
                expect.objectContaining({
                    method: 'POST',
                })
            );

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(callBody).toEqual(repoInfo);
        });
    });

    describe('getLinkedProjects', () => {
        it('should fetch linked projects', async () => {
            const mockProjects = [
                { id: 'proj-1', name: 'Test Project', createdAt: '', updatedAt: '' },
            ];

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: mockProjects }),
            });

            const projects = await apiService.getLinkedProjects();

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.stint.test/api/agent/projects',
                expect.any(Object)
            );
            expect(projects).toEqual(mockProjects);
        });
    });

    describe('getCurrentUser', () => {
        it('should fetch current user', async () => {
            const mockUser = { id: 'user-1', name: 'Test User', email: 'test@example.com' };

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockUser),
            });

            const user = await apiService.getCurrentUser();

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.stint.test/api/user',
                expect.any(Object)
            );
            expect(user).toEqual(mockUser);
        });
    });
});
