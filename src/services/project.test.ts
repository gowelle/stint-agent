import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import path from 'path';

// Mock dependencies
vi.mock('../utils/config.js', () => ({
    config: {
        getProject: vi.fn(),
        setProject: vi.fn(),
        removeProject: vi.fn(),
        getProjects: vi.fn(() => ({})),
    },
}));

vi.mock('./git.js', () => ({
    gitService: {
        isRepo: vi.fn(),
        getRepoRoot: vi.fn(),
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

describe('ProjectService', () => {
    let projectService: typeof import('./project.js').projectService;
    let config: typeof import('../utils/config.js').config;
    let gitService: typeof import('./git.js').gitService;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();

        const configModule = await import('../utils/config.js');
        const gitModule = await import('./git.js');
        const projectModule = await import('./project.js');

        config = configModule.config;
        gitService = gitModule.gitService;
        projectService = projectModule.projectService;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('linkProject', () => {
        it('should link valid git repository using repo root', async () => {
            (gitService.getRepoRoot as Mock).mockResolvedValue('/path/to/repo/root');
            (gitService.isRepo as Mock).mockResolvedValue(true);

            await projectService.linkProject('/path/to/repo/root/src', 'proj-123');

            expect(gitService.getRepoRoot).toHaveBeenCalled();
            expect(config.setProject).toHaveBeenCalledWith(
                expect.stringMatching(/root$/),
                expect.objectContaining({
                    projectId: 'proj-123',
                    linkedAt: expect.any(String),
                })
            );
        });

        it('should fallback to absolute path if repo root not found but isRepo is true', async () => {
            (gitService.getRepoRoot as Mock).mockResolvedValue(null);
            (gitService.isRepo as Mock).mockResolvedValue(true);

            await projectService.linkProject('./relative/path', 'proj-123');

            expect(config.setProject).toHaveBeenCalledWith(
                path.resolve('./relative/path'),
                expect.any(Object)
            );
        });

        it('should throw error for non-git directory', async () => {
            (gitService.getRepoRoot as Mock).mockResolvedValue(null);
            (gitService.isRepo as Mock).mockResolvedValue(false);

            await expect(projectService.linkProject('/not/a/repo', 'proj-123')).rejects.toThrow(
                'is not a git repository'
            );

            expect(config.setProject).not.toHaveBeenCalled();
        });

        it('should throw error if git check fails', async () => {
            (gitService.getRepoRoot as Mock).mockRejectedValue(new Error('Git error'));

            await expect(projectService.linkProject('/path', 'proj-123')).rejects.toThrow();
        });
    });

    describe('unlinkProject', () => {
        it('should unlink existing project via root lookup', async () => {
            (gitService.getRepoRoot as Mock).mockResolvedValue('/path/to/repo');
            (config.getProject as Mock).mockReturnValue({
                projectId: 'proj-123',
                linkedAt: '2024-01-01T00:00:00Z',
            });

            await projectService.unlinkProject('/path/to/repo/subdir');

            expect(config.removeProject).toHaveBeenCalledWith(expect.stringMatching(/repo$/));
        });

        it('should throw error if project not linked', async () => {
            (gitService.getRepoRoot as Mock).mockResolvedValue(null);
            (config.getProject as Mock).mockReturnValue(undefined);

            await expect(projectService.unlinkProject('/not/linked')).rejects.toThrow(
                'is not linked to any project'
            );

            expect(config.removeProject).not.toHaveBeenCalled();
        });
    });

    describe('getLinkedProject', () => {
        it('should return linked project from exact match', async () => {
            const linkedProject = { projectId: 'proj-123', linkedAt: '2024-01-01T00:00:00Z' };
            (config.getProject as Mock).mockReturnValue(linkedProject);

            const result = await projectService.getLinkedProject('/path/to/repo');

            expect(result).toEqual(linkedProject);
        });

        it('should return linked project from repo root lookup', async () => {
            const linkedProject = { projectId: 'proj-root', linkedAt: '2024-01-01T00:00:00Z' };
            // First call (exact) returns undefined
            // Second call (root) returns project
            (config.getProject as Mock)
                .mockReturnValueOnce(undefined)
                .mockReturnValueOnce(linkedProject);

            (gitService.getRepoRoot as Mock).mockResolvedValue('/path/to/root');

            const result = await projectService.getLinkedProject('/path/to/root/subdir');

            expect(result).toEqual(linkedProject);
            expect(gitService.getRepoRoot).toHaveBeenCalled();
        });

        it('should return null if not linked anywhere', async () => {
            (config.getProject as Mock).mockReturnValue(undefined);
            (gitService.getRepoRoot as Mock).mockResolvedValue(null);

            const result = await projectService.getLinkedProject('/not/linked');

            expect(result).toBeNull();
        });
    });

    describe('getAllLinkedProjects', () => {
        it('should return all linked projects', () => {
            const projects = {
                '/path/one': { projectId: 'proj-1', linkedAt: '2024-01-01' },
                '/path/two': { projectId: 'proj-2', linkedAt: '2024-01-02' },
            };
            (config.getProjects as Mock).mockReturnValue(projects);

            const result = projectService.getAllLinkedProjects();

            expect(result).toEqual(projects);
        });

        it('should return empty object if no projects linked', () => {
            (config.getProjects as Mock).mockReturnValue({});

            const result = projectService.getAllLinkedProjects();

            expect(result).toEqual({});
        });
    });

    describe('getProjectPath', () => {
        it('should return path for project ID', () => {
            const projects = {
                '/path/to/myapp': { projectId: 'proj-123', linkedAt: '2024-01-01' },
                '/path/to/other': { projectId: 'proj-456', linkedAt: '2024-01-02' },
            };
            (config.getProjects as Mock).mockReturnValue(projects);

            const result = projectService.getProjectPath('proj-123');

            expect(result).toBe('/path/to/myapp');
        });

        it('should return null if project ID not found', () => {
            const projects = {
                '/path/to/myapp': { projectId: 'proj-123', linkedAt: '2024-01-01' },
            };
            (config.getProjects as Mock).mockReturnValue(projects);

            const result = projectService.getProjectPath('non-existent');

            expect(result).toBeNull();
        });

        it('should return null if no projects linked', () => {
            (config.getProjects as Mock).mockReturnValue({});

            const result = projectService.getProjectPath('any-id');

            expect(result).toBeNull();
        });
    });
});
