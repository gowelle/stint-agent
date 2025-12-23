import { describe, it, expect } from 'vitest';
import { parseGitError, GitErrorType } from './git-errors.js';

describe('parseGitError', () => {
    it('should detect authentication errors', () => {
        const error = new Error('Permission denied (publickey)');
        const result = parseGitError(error);

        expect(result.type).toBe(GitErrorType.AUTH_ERROR);
        expect(result.message).toBe('Git authentication failed');
        expect(result.suggestion).toContain('SSH keys');
    });

    it('should detect network errors', () => {
        const error = new Error('Could not resolve host: github.com');
        const result = parseGitError(error);

        expect(result.type).toBe(GitErrorType.NETWORK_ERROR);
        expect(result.message).toBe('Network connection failed');
        expect(result.suggestion).toContain('internet connection');
    });

    it('should detect not a git repository errors', () => {
        const error = new Error('fatal: not a git repository');
        const result = parseGitError(error);

        expect(result.type).toBe(GitErrorType.NOT_A_REPO);
        expect(result.message).toBe('Not a git repository');
        expect(result.suggestion).toContain('git init');
    });

    it('should detect merge conflicts', () => {
        const error = new Error('Merge conflict in file.txt');
        const result = parseGitError(error);

        expect(result.type).toBe(GitErrorType.MERGE_CONFLICT);
        expect(result.message).toBe('Merge conflict detected');
        expect(result.suggestion).toContain('Resolve conflicts');
    });

    it('should detect detached HEAD state', () => {
        const error = new Error('You are in detached HEAD state');
        const result = parseGitError(error);

        expect(result.type).toBe(GitErrorType.DETACHED_HEAD);
        expect(result.message).toContain('detached HEAD');
        expect(result.suggestion).toContain('git checkout');
    });

    it('should detect no changes errors', () => {
        const error = new Error('nothing to commit, working tree clean');
        const result = parseGitError(error);

        expect(result.type).toBe(GitErrorType.NO_CHANGES);
        expect(result.message).toBe('No changes to commit');
        expect(result.suggestion).toContain('git add');
    });

    it('should handle unknown errors', () => {
        const error = new Error('Some random git error');
        const result = parseGitError(error);

        expect(result.type).toBe(GitErrorType.UNKNOWN);
        expect(result.message).toBe('Some random git error');
        expect(result.suggestion).toContain('git status');
    });

    it('should be case insensitive', () => {
        const error = new Error('PERMISSION DENIED (publickey)');
        const result = parseGitError(error);

        expect(result.type).toBe(GitErrorType.AUTH_ERROR);
    });
});
