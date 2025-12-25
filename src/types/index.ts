// User and Authentication Types
export interface User {
    id: string;
    name: string;
    email: string;
}

export interface AgentSession {
    id: string;
    machineId: string;
    machineName: string;
    connectedAt: string;
    lastHeartbeat: string;
}

// Project Types
export interface Project {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
}

export interface LinkedProject {
    projectId: string;
    linkedAt: string;
}

// Commit Types
export interface Commit {
    id: string;
    projectId: string;
    message: string;
    sha?: string;
    status: 'pending' | 'executed' | 'failed' | 'committed_not_pushed';
    createdAt: string;
    executedAt?: string;
    error?: string;
    pushError?: string;
}

export interface PendingCommit {
    id: string;
    projectId: string;
    message: string;
    files?: string[]; // Specific files to stage, or undefined for all
    createdAt: string;
}

export interface Suggestion {
    id: string;
    project_id: string; // Serialized from PHP model
    user_id: string;
    type: string;
    title: string;
    description: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: Record<string, any>;
    priority: 'low' | 'medium' | 'high';
    status: 'active' | 'dismissed' | 'actioned';
    dismissed_at?: string;
    actioned_at?: string;
    expires_at?: string;
    created_at: string;
    updated_at: string;
}

// Git Types
export interface RepoInfo {
    repoPath: string;
    currentBranch: string;
    defaultBranch: string;
    branches: string[];
    remoteUrl: string | null;
    status: GitStatus;
    lastCommitSha: string;
    lastCommitMessage: string;
    lastCommitDate: string;
}

export interface GitStatus {
    staged: string[];
    unstaged: string[];
    untracked: string[];
    ahead: number;
    behind: number;
}

export interface Branch {
    name: string;
    current: boolean;
    commit: string;
}

// Configuration Types
export interface Config {
    apiUrl: string;
    wsUrl: string;
    reverbAppKey?: string;
    environment?: 'development' | 'production';
    token?: string;
    machineId: string;
    machineName: string;
    projects: Record<string, LinkedProject>;
}

// WebSocket Event Types
export interface CommitApprovedEvent {
    event: 'commit.approved';
    data: {
        commit: PendingCommit;
        project: Project;
    };
}

export interface SyncRequestedEvent {
    event: 'sync.requested';
    data: {
        projectId: string;
    };
}

export interface CommitPendingEvent {
    event: 'commit.pending';
    data: {
        pendingCommit: PendingCommit;
    };
}

export interface SuggestionCreatedEvent {
    event: 'suggestion.created';
    data: {
        suggestion: Suggestion;
    };
}

export interface CommitExecutedEvent {
    event: 'commit.executed';
    data: {
        commitId: string;
        sha: string;
        branch: string;
    };
}

export interface CommitFailedEvent {
    event: 'commit.failed';
    data: {
        commitId: string;
        error: string;
    };
}

export type WebSocketEvent =
    | CommitApprovedEvent
    | SyncRequestedEvent
    | CommitPendingEvent
    | SuggestionCreatedEvent;
export type OutgoingWebSocketEvent = CommitExecutedEvent | CommitFailedEvent;

// Service Interfaces
export interface AuthService {
    saveToken(token: string): Promise<void>;
    getToken(): Promise<string | null>;
    clearToken(): Promise<void>;
    validateToken(): Promise<User | null>;
    getMachineId(): string;
}

export interface ApiService {
    connect(): Promise<AgentSession>;
    disconnect(): Promise<void>;
    heartbeat(): Promise<void>;
    getPendingCommits(projectId: string): Promise<PendingCommit[]>;
    markCommitExecuted(commitId: string, sha: string): Promise<Commit>;
    markCommitFailed(commitId: string, error: string): Promise<void>;
    syncProject(projectId: string, data: RepoInfo): Promise<void>;
    getLinkedProjects(): Promise<Project[]>;
    createProject(data: {
        name: string;
        description?: string;
        repo_path?: string;
        remote_url?: string;
        default_branch?: string;
    }): Promise<Project>;
}

export interface GitService {
    isRepo(path: string): Promise<boolean>;
    getRepoInfo(path: string): Promise<RepoInfo>;
    stageAll(path: string): Promise<void>;
    stageFiles(path: string, files: string[]): Promise<void>;
    commit(path: string, message: string): Promise<string>;
    getCurrentBranch(path: string): Promise<string>;
    getBranches(path: string): Promise<Branch[]>;
    getStatus(path: string): Promise<GitStatus>;
    push(path: string, remote?: string, branch?: string): Promise<void>;
}

export interface WebSocketService {
    connect(): Promise<void>;
    disconnect(): void;
    isConnected(): boolean;
    subscribeToUserChannel(userId: string): void;
    onCommitApproved(handler: (commit: PendingCommit, project: Project) => void): void;
    onCommitPending(handler: (commit: PendingCommit) => void): void;
    onSuggestionCreated(handler: (suggestion: Suggestion) => void): void;
    onProjectUpdated(handler: (project: Project) => void): void;
    onDisconnect(handler: () => void): void;
}

export interface ProjectService {
    linkProject(path: string, projectId: string): Promise<void>;
    unlinkProject(path: string): Promise<void>;
    getLinkedProject(path: string): LinkedProject | null;
    getAllLinkedProjects(): Record<string, LinkedProject>;
}
