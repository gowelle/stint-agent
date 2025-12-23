/**
 * Git error types for categorization
 */
export enum GitErrorType {
    AUTH_ERROR = 'AUTH_ERROR',
    NETWORK_ERROR = 'NETWORK_ERROR',
    NOT_A_REPO = 'NOT_A_REPO',
    MERGE_CONFLICT = 'MERGE_CONFLICT',
    PERMISSION_ERROR = 'PERMISSION_ERROR',
    DETACHED_HEAD = 'DETACHED_HEAD',
    NO_CHANGES = 'NO_CHANGES',
    UNKNOWN = 'UNKNOWN',
}

/**
 * Parsed git error with actionable information
 */
export interface ParsedGitError {
    type: GitErrorType;
    message: string;
    suggestion: string;
}

/**
 * Parse git error and provide actionable suggestions
 */
export function parseGitError(error: Error): ParsedGitError {
    const errorMessage = error.message.toLowerCase();

    // Authentication errors
    if (errorMessage.includes('permission denied') || errorMessage.includes('authentication failed')) {
        return {
            type: GitErrorType.AUTH_ERROR,
            message: 'Git authentication failed',
            suggestion: 'Check your SSH keys or credentials. Run: git config --list | grep user',
        };
    }

    // Network errors
    if (errorMessage.includes('could not resolve host') ||
        errorMessage.includes('connection timed out') ||
        errorMessage.includes('network is unreachable')) {
        return {
            type: GitErrorType.NETWORK_ERROR,
            message: 'Network connection failed',
            suggestion: 'Check your internet connection and try again',
        };
    }

    // Not a git repository
    if (errorMessage.includes('not a git repository') || errorMessage.includes('not found')) {
        return {
            type: GitErrorType.NOT_A_REPO,
            message: 'Not a git repository',
            suggestion: 'Initialize a git repository with: git init',
        };
    }

    // Merge conflicts
    if (errorMessage.includes('merge conflict') || errorMessage.includes('conflict')) {
        return {
            type: GitErrorType.MERGE_CONFLICT,
            message: 'Merge conflict detected',
            suggestion: 'Resolve conflicts manually and run: git add . && git commit',
        };
    }

    // Permission errors
    if (errorMessage.includes('permission denied') && !errorMessage.includes('publickey')) {
        return {
            type: GitErrorType.PERMISSION_ERROR,
            message: 'File permission error',
            suggestion: 'Check file permissions in your repository',
        };
    }

    // Detached HEAD
    if (errorMessage.includes('detached head') || errorMessage.includes('not currently on a branch')) {
        return {
            type: GitErrorType.DETACHED_HEAD,
            message: 'Repository is in detached HEAD state',
            suggestion: 'Checkout a branch with: git checkout <branch-name>',
        };
    }

    // No changes to commit
    if (errorMessage.includes('nothing to commit') || errorMessage.includes('no changes')) {
        return {
            type: GitErrorType.NO_CHANGES,
            message: 'No changes to commit',
            suggestion: 'Make changes to files and stage them with: git add <files>',
        };
    }

    // Unknown error
    return {
        type: GitErrorType.UNKNOWN,
        message: error.message,
        suggestion: 'Check git status and logs for more information: git status && git log',
    };
}
