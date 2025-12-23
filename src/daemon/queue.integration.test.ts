import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PendingCommit, Project } from '../types/index.js';

// Use vi.hoisted to define mocks that can be accessed in vi.mock factories
const { mockGitService, mockApiService, mockProjectService } = vi.hoisted(() => {
    return {
        mockGitService: {
            isRepo: vi.fn(),
            getStatus: vi.fn(),
            commit: vi.fn(),
        },
        mockApiService: {
            markCommitExecuted: vi.fn(),
            markCommitFailed: vi.fn(),
        },
        mockProjectService: {
            getAllLinkedProjects: vi.fn(),
        },
    };
});

// Mock dependencies
vi.mock('../services/git.js', () => ({
    gitService: mockGitService,
}));

vi.mock('../services/api.js', () => ({
    apiService: mockApiService,
}));

vi.mock('../services/project.js', () => ({
    projectService: mockProjectService,
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

// Import after mocks are set up
const { commitQueue } = await import('./queue.js');

describe('CommitQueue Integration Tests', () => {
    // Test fixtures
    const testProject: Project = {
        id: 'proj_123',
        name: 'Test Project',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };

    const testCommit: PendingCommit = {
        id: 'commit_456',
        message: 'Test commit message',
        files: ['file1.ts', 'file2.ts'],
        createdAt: '2024-01-01T00:00:00Z',
    };

    const testProjectPath = '/test/project/path';

    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock implementations
        mockProjectService.getAllLinkedProjects.mockReturnValue({
            [testProjectPath]: {
                projectId: testProject.id,
                linkedAt: '2024-01-01T00:00:00Z',
            },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Successful Commit Execution', () => {
        it('should execute commit successfully with staged changes', async () => {
            // Arrange
            mockGitService.isRepo.mockResolvedValue(true);
            mockGitService.getStatus.mockResolvedValue({
                staged: ['file1.ts', 'file2.ts'],
                unstaged: [],
                untracked: [],
                ahead: 0,
                behind: 0,
            });
            mockGitService.commit.mockResolvedValue('abc123def456');
            mockApiService.markCommitExecuted.mockResolvedValue(undefined);

            // Act
            const sha = await commitQueue.executeCommit(testCommit, testProject);

            // Assert
            expect(sha).toBe('abc123def456');
            expect(mockGitService.isRepo).toHaveBeenCalledWith(testProjectPath);
            expect(mockGitService.getStatus).toHaveBeenCalledWith(testProjectPath);
            expect(mockGitService.commit).toHaveBeenCalledWith(testProjectPath, testCommit.message);
            expect(mockApiService.markCommitExecuted).toHaveBeenCalledWith(testCommit.id, 'abc123def456');
        });

        it('should report success to API after commit', async () => {
            // Arrange
            mockGitService.isRepo.mockResolvedValue(true);
            mockGitService.getStatus.mockResolvedValue({
                staged: ['file1.ts'],
                unstaged: [],
                untracked: [],
                ahead: 0,
                behind: 0,
            });
            mockGitService.commit.mockResolvedValue('sha789');
            mockApiService.markCommitExecuted.mockResolvedValue(undefined);

            // Act
            await commitQueue.executeCommit(testCommit, testProject);

            // Assert
            expect(mockApiService.markCommitExecuted).toHaveBeenCalledTimes(1);
            expect(mockApiService.markCommitExecuted).toHaveBeenCalledWith(testCommit.id, 'sha789');
        });
    });

    describe('Error Scenarios', () => {
        it('should throw error when no staged changes', async () => {
            // Arrange
            mockGitService.isRepo.mockResolvedValue(true);
            mockGitService.getStatus.mockResolvedValue({
                staged: [],
                unstaged: ['file1.ts'],
                untracked: [],
                ahead: 0,
                behind: 0,
            });
            mockApiService.markCommitFailed.mockResolvedValue(undefined);

            // Act & Assert
            await expect(commitQueue.executeCommit(testCommit, testProject)).rejects.toThrow(
                'No staged changes to commit'
            );

            expect(mockGitService.commit).not.toHaveBeenCalled();
            expect(mockApiService.markCommitFailed).toHaveBeenCalledWith(
                testCommit.id,
                expect.stringContaining('No staged changes')
            );
        });

        it('should throw error when project is not linked', async () => {
            // Arrange
            mockProjectService.getAllLinkedProjects.mockReturnValue({});
            mockApiService.markCommitFailed.mockResolvedValue(undefined);

            // Act & Assert
            await expect(commitQueue.executeCommit(testCommit, testProject)).rejects.toThrow(
                'Project proj_123 is not linked to any local directory'
            );

            expect(mockGitService.isRepo).not.toHaveBeenCalled();
            expect(mockApiService.markCommitFailed).toHaveBeenCalledWith(
                testCommit.id,
                expect.stringContaining('not linked')
            );
        });

        it('should throw error when directory is not a git repository', async () => {
            // Arrange
            mockGitService.isRepo.mockResolvedValue(false);
            mockApiService.markCommitFailed.mockResolvedValue(undefined);

            // Act & Assert
            await expect(commitQueue.executeCommit(testCommit, testProject)).rejects.toThrow(
                'is not a git repository'
            );

            expect(mockGitService.getStatus).not.toHaveBeenCalled();
            expect(mockApiService.markCommitFailed).toHaveBeenCalledWith(
                testCommit.id,
                expect.stringContaining('not a git repository')
            );
        });

        it('should handle git commit failure', async () => {
            // Arrange
            mockGitService.isRepo.mockResolvedValue(true);
            mockGitService.getStatus.mockResolvedValue({
                staged: ['file1.ts'],
                unstaged: [],
                untracked: [],
                ahead: 0,
                behind: 0,
            });
            mockGitService.commit.mockRejectedValue(new Error('Git commit failed'));
            mockApiService.markCommitFailed.mockResolvedValue(undefined);

            // Act & Assert
            await expect(commitQueue.executeCommit(testCommit, testProject)).rejects.toThrow(
                'Git commit failed'
            );

            expect(mockApiService.markCommitFailed).toHaveBeenCalledWith(
                testCommit.id,
                'Git commit failed'
            );
        });
    });

    describe('API Reporting Failure Handling', () => {
        it('should not throw when API success reporting fails', async () => {
            // Arrange
            mockGitService.isRepo.mockResolvedValue(true);
            mockGitService.getStatus.mockResolvedValue({
                staged: ['file1.ts'],
                unstaged: [],
                untracked: [],
                ahead: 0,
                behind: 0,
            });
            mockGitService.commit.mockResolvedValue('sha123');
            mockApiService.markCommitExecuted.mockRejectedValue(new Error('API error'));

            // Act - should not throw
            const sha = await commitQueue.executeCommit(testCommit, testProject);

            // Assert
            expect(sha).toBe('sha123');
            expect(mockApiService.markCommitExecuted).toHaveBeenCalled();
        });

        it('should not throw when API failure reporting fails', async () => {
            // Arrange
            mockGitService.isRepo.mockResolvedValue(true);
            mockGitService.getStatus.mockResolvedValue({
                staged: [],
                unstaged: [],
                untracked: [],
                ahead: 0,
                behind: 0,
            });
            mockApiService.markCommitFailed.mockRejectedValue(new Error('API error'));

            // Act & Assert - should throw original error, not API error
            await expect(commitQueue.executeCommit(testCommit, testProject)).rejects.toThrow(
                'No staged changes'
            );
        });
    });

    describe('Queue Processing', () => {
        it('should process commits sequentially', async () => {
            // Arrange
            const commit1: PendingCommit = { ...testCommit, id: 'commit_1', message: 'First commit' };
            const commit2: PendingCommit = { ...testCommit, id: 'commit_2', message: 'Second commit' };
            const commit3: PendingCommit = { ...testCommit, id: 'commit_3', message: 'Third commit' };

            const executionOrder: string[] = [];

            mockGitService.isRepo.mockResolvedValue(true);
            mockGitService.getStatus.mockResolvedValue({
                staged: ['file.ts'],
                unstaged: [],
                untracked: [],
                ahead: 0,
                behind: 0,
            });

            mockGitService.commit.mockImplementation(async (_path: string, message: string) => {
                executionOrder.push(message);
                // Add small delay to simulate real git operation
                await new Promise(resolve => setTimeout(resolve, 10));
                return `sha_${message}`;
            });

            mockApiService.markCommitExecuted.mockResolvedValue(undefined);

            // Act
            commitQueue.addToQueue(commit1, testProject);
            commitQueue.addToQueue(commit2, testProject);
            commitQueue.addToQueue(commit3, testProject);

            // Wait for queue to process
            await new Promise(resolve => setTimeout(resolve, 100));

            // Assert
            expect(executionOrder).toEqual(['First commit', 'Second commit', 'Third commit']);
            expect(commitQueue.getQueueLength()).toBe(0);
            expect(commitQueue.isCurrentlyProcessing()).toBe(false);
        });

        it('should continue processing queue even if one commit fails', async () => {
            // Arrange
            const commit1: PendingCommit = { ...testCommit, id: 'commit_1', message: 'Success commit' };
            const commit2: PendingCommit = { ...testCommit, id: 'commit_2', message: 'Fail commit' };
            const commit3: PendingCommit = { ...testCommit, id: 'commit_3', message: 'Another success' };

            const executionAttempts: string[] = [];

            mockGitService.isRepo.mockResolvedValue(true);
            mockGitService.getStatus.mockResolvedValue({
                staged: ['file.ts'],
                unstaged: [],
                untracked: [],
                ahead: 0,
                behind: 0,
            });

            mockGitService.commit.mockImplementation(async (_path: string, message: string) => {
                executionAttempts.push(message);
                if (message === 'Fail commit') {
                    throw new Error('Simulated failure');
                }
                return `sha_${message}`;
            });

            mockApiService.markCommitExecuted.mockResolvedValue(undefined);
            mockApiService.markCommitFailed.mockResolvedValue(undefined);

            // Act
            commitQueue.addToQueue(commit1, testProject);
            commitQueue.addToQueue(commit2, testProject);
            commitQueue.addToQueue(commit3, testProject);

            // Wait for queue to process
            await new Promise(resolve => setTimeout(resolve, 100));

            // Assert
            expect(executionAttempts).toEqual(['Success commit', 'Fail commit', 'Another success']);
            expect(commitQueue.getQueueLength()).toBe(0);
            expect(mockApiService.markCommitExecuted).toHaveBeenCalledTimes(2);
            expect(mockApiService.markCommitFailed).toHaveBeenCalledTimes(1);
        });
    });
});
