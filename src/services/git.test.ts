import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock simple-git
const mockGit = {
    checkIsRepo: vi.fn(),
    branch: vi.fn(),
    getRemotes: vi.fn(),
    log: vi.fn(),
    status: vi.fn(),
    add: vi.fn(),
    commit: vi.fn(),
    raw: vi.fn(),
    revparse: vi.fn(),
};

vi.mock('simple-git', () => ({
    default: vi.fn(() => mockGit),
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

describe('GitService', () => {
    let gitService: typeof import('./git.js').gitService;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();

        // Reset all mock implementations
        mockGit.checkIsRepo.mockReset();
        mockGit.branch.mockReset();
        mockGit.getRemotes.mockReset();
        mockGit.log.mockReset();
        mockGit.status.mockReset();
        mockGit.add.mockReset();
        mockGit.commit.mockReset();
        mockGit.raw.mockReset();
        mockGit.revparse.mockReset();

        const gitModule = await import('./git.js');
        gitService = gitModule.gitService;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('isRepo', () => {
        it('should return true for valid git repository', async () => {
            mockGit.checkIsRepo.mockResolvedValue(true);

            const result = await gitService.isRepo('/path/to/repo');

            expect(result).toBe(true);
        });

        it('should return false for non-git directory', async () => {
            mockGit.checkIsRepo.mockResolvedValue(false);

            const result = await gitService.isRepo('/path/to/not-repo');

            expect(result).toBe(false);
        });

        it('should return false on error', async () => {
            mockGit.checkIsRepo.mockRejectedValue(new Error('Not a git repo'));

            const result = await gitService.isRepo('/invalid/path');

            expect(result).toBe(false);
        });
    });

    describe('getRepoInfo', () => {
        it('should return complete repo info', async () => {
            mockGit.branch.mockResolvedValue({
                current: 'main',
                all: ['main', 'develop', 'feature/test'],
                branches: {
                    main: { commit: 'abc123' },
                    develop: { commit: 'def456' },
                    'feature/test': { commit: 'ghi789' },
                },
            });
            mockGit.getRemotes.mockResolvedValue([
                { name: 'origin', refs: { fetch: 'https://github.com/test/repo.git', push: 'https://github.com/test/repo.git' } },
            ]);
            mockGit.raw.mockResolvedValue('refs/remotes/origin/main\n');
            mockGit.status.mockResolvedValue({
                staged: ['file1.ts'],
                modified: ['file2.ts'],
                deleted: [],
                not_added: ['file3.ts'],
                ahead: 2,
                behind: 1,
            });
            mockGit.log.mockResolvedValue({
                latest: {
                    hash: 'abc123def456',
                    message: 'Initial commit',
                    date: '2024-01-01T00:00:00Z',
                },
            });

            const info = await gitService.getRepoInfo('/path/to/repo');

            expect(info).toEqual({
                repoPath: '/path/to/repo',
                currentBranch: 'main',
                defaultBranch: 'main',
                branches: ['main', 'develop', 'feature/test'],
                remoteUrl: 'https://github.com/test/repo.git',
                status: {
                    staged: ['file1.ts'],
                    unstaged: ['file2.ts'],
                    untracked: ['file3.ts'],
                    ahead: 2,
                    behind: 1,
                },
                lastCommitSha: 'abc123def456',
                lastCommitMessage: 'Initial commit',
                lastCommitDate: '2024-01-01T00:00:00Z',
            });
        });

        it('should handle repo with no remotes', async () => {
            mockGit.branch.mockResolvedValue({ current: 'main', all: ['main'], branches: {} });
            mockGit.getRemotes.mockResolvedValue([]);
            mockGit.status.mockResolvedValue({ staged: [], modified: [], deleted: [], not_added: [], ahead: 0, behind: 0 });
            mockGit.log.mockResolvedValue({ latest: { hash: 'abc', message: 'Init', date: '2024-01-01' } });

            const info = await gitService.getRepoInfo('/path/to/repo');

            expect(info.remoteUrl).toBeNull();
        });

        it('should throw error when no commits exist', async () => {
            mockGit.branch.mockResolvedValue({ current: 'main', all: ['main'], branches: {} });
            mockGit.getRemotes.mockResolvedValue([]);
            mockGit.status.mockResolvedValue({ staged: [], modified: [], deleted: [], not_added: [], ahead: 0, behind: 0 });
            mockGit.log.mockResolvedValue({ latest: null });

            await expect(gitService.getRepoInfo('/path/to/repo')).rejects.toThrow(
                'Failed to get repository information'
            );
        });
    });

    describe('stageAll', () => {
        it('should stage all changes', async () => {
            mockGit.add.mockResolvedValue(undefined);

            await gitService.stageAll('/path/to/repo');

            expect(mockGit.add).toHaveBeenCalledWith('.');
        });

        it('should throw error on failure', async () => {
            mockGit.add.mockRejectedValue(new Error('Git add failed'));

            await expect(gitService.stageAll('/path/to/repo')).rejects.toThrow(
                'Failed to stage changes'
            );
        });
    });

    describe('stageFiles', () => {
        it('should stage specific files', async () => {
            mockGit.add.mockResolvedValue(undefined);

            await gitService.stageFiles('/path/to/repo', ['file1.ts', 'file2.ts']);

            expect(mockGit.add).toHaveBeenCalledWith(['file1.ts', 'file2.ts']);
        });

        it('should throw error on failure', async () => {
            mockGit.add.mockRejectedValue(new Error('Git add failed'));

            await expect(gitService.stageFiles('/path/to/repo', ['file.ts'])).rejects.toThrow(
                'Failed to stage files'
            );
        });
    });

    describe('commit', () => {
        it('should create commit and return SHA', async () => {
            mockGit.commit.mockResolvedValue({ commit: 'abc123def' });

            const sha = await gitService.commit('/path/to/repo', 'Test commit message');

            expect(mockGit.commit).toHaveBeenCalledWith('Test commit message');
            expect(sha).toBe('abc123def');
        });

        it('should throw error on failure', async () => {
            mockGit.commit.mockRejectedValue(new Error('Nothing to commit'));

            await expect(gitService.commit('/path/to/repo', 'Message')).rejects.toThrow(
                'Failed to create commit'
            );
        });
    });

    describe('getCurrentBranch', () => {
        it('should return current branch name', async () => {
            mockGit.branch.mockResolvedValue({ current: 'feature/awesome' });

            const branch = await gitService.getCurrentBranch('/path/to/repo');

            expect(branch).toBe('feature/awesome');
        });

        it('should throw error on failure', async () => {
            mockGit.branch.mockRejectedValue(new Error('Not a git repo'));

            await expect(gitService.getCurrentBranch('/path')).rejects.toThrow(
                'Failed to get current branch'
            );
        });
    });

    describe('getBranches', () => {
        it('should return all branches with details', async () => {
            mockGit.branch.mockResolvedValue({
                current: 'main',
                all: ['main', 'develop'],
                branches: {
                    main: { commit: 'abc123' },
                    develop: { commit: 'def456' },
                },
            });

            const branches = await gitService.getBranches('/path/to/repo');

            expect(branches).toEqual([
                { name: 'main', current: true, commit: 'abc123' },
                { name: 'develop', current: false, commit: 'def456' },
            ]);
        });

        it('should handle missing commit info', async () => {
            mockGit.branch.mockResolvedValue({
                current: 'main',
                all: ['main'],
                branches: {},
            });

            const branches = await gitService.getBranches('/path/to/repo');

            expect(branches).toEqual([
                { name: 'main', current: true, commit: '' },
            ]);
        });
    });

    describe('getStatus', () => {
        it('should return git status', async () => {
            mockGit.status.mockResolvedValue({
                staged: ['staged.ts'],
                modified: ['modified.ts'],
                deleted: ['deleted.ts'],
                not_added: ['untracked.ts'],
                ahead: 5,
                behind: 2,
            });

            const status = await gitService.getStatus('/path/to/repo');

            expect(status).toEqual({
                staged: ['staged.ts'],
                unstaged: ['modified.ts', 'deleted.ts'],
                untracked: ['untracked.ts'],
                ahead: 5,
                behind: 2,
            });
        });

        it('should throw error on failure', async () => {
            mockGit.status.mockRejectedValue(new Error('Status failed'));

            await expect(gitService.getStatus('/path')).rejects.toThrow(
                'Failed to get git status'
            );
        });
    });

    describe('getRepoRoot', () => {
        it('should return repo root path', async () => {
            mockGit.revparse.mockResolvedValue('/home/user/projects/my-repo\n');

            const root = await gitService.getRepoRoot('/home/user/projects/my-repo/src');

            expect(mockGit.revparse).toHaveBeenCalledWith(['--show-toplevel']);
            expect(root).toBe('/home/user/projects/my-repo');
        });

        it('should return null on error', async () => {
            mockGit.revparse.mockRejectedValue(new Error('Not a git repo'));

            const root = await gitService.getRepoRoot('/not/a/repo');

            expect(root).toBeNull();
        });
    });

    describe('getBranches error handling', () => {
        it('should throw error on failure', async () => {
            mockGit.branch.mockRejectedValue(new Error('Branch failed'));

            await expect(gitService.getBranches('/path')).rejects.toThrow(
                'Failed to get branches'
            );
        });
    });

    describe('getRepoInfo with master fallback', () => {
        it('should fallback to master when origin/HEAD fails', async () => {
            mockGit.branch.mockResolvedValue({
                current: 'feature/test',
                all: ['master', 'feature/test'],
                branches: {
                    master: { commit: 'abc123' },
                    'feature/test': { commit: 'def456' },
                },
            });
            mockGit.getRemotes.mockResolvedValue([
                { name: 'origin', refs: { fetch: 'https://github.com/test/repo.git', push: 'https://github.com/test/repo.git' } },
            ]);
            mockGit.raw.mockRejectedValue(new Error('No origin/HEAD'));
            mockGit.status.mockResolvedValue({
                staged: [],
                modified: [],
                deleted: [],
                not_added: [],
                ahead: 0,
                behind: 0,
            });
            mockGit.log.mockResolvedValue({
                latest: {
                    hash: 'abc123def456',
                    message: 'Initial commit',
                    date: '2024-01-01T00:00:00Z',
                },
            });

            const info = await gitService.getRepoInfo('/path/to/repo');

            expect(info.defaultBranch).toBe('master');
        });
    });
});
