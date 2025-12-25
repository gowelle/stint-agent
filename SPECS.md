# Stint Agent - Node CLI

## Overview

The Stint Agent is a lightweight Node.js CLI daemon that runs on the developer's machine. It bridges the gap between the Stint web app and local git repositories, enabling commit execution and repo status syncing.

## Tech Stack

- **Runtime**: Node.js 20+
- **CLI Framework**: Commander.js
- **WebSocket**: ws (for Reverb connection)
- **Git Operations**: simple-git
- **Config Storage**: conf (stores in ~/.config/stint/)
- **Build**: tsup (for single-file bundle)
- **Package Manager**: pnpm

## Installation

```bash
npm install -g @stint/agent
# or
pnpm add -g @stint/agent
```

## Commands

```bash
# Authentication
stint login              # Opens browser for OAuth, stores token
stint logout             # Removes stored credentials
stint whoami             # Show current user

# Daemon
stint daemon start       # Start background daemon
stint daemon stop        # Stop daemon
stint daemon status      # Check if running
stint daemon logs        # Tail daemon logs

# Project linking
stint link               # Link current directory to a Stint project
stint unlink             # Remove link
stint status             # Show linked project and connection status

# Manual operations
stint sync               # Manually sync repo info to server
stint commits            # List pending commits for this repo
stint commit <id>        # Execute a specific pending commit (supports partial ID)
  --auto-stage           # Automatically stage files specified in commit
  --push                 # Push changes to remote after committing
  --force                # Skip file validation warnings
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│  CLI Entry Point (commander)                    │
│  - Parses commands                              │
│  - Validates auth                               │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  Daemon Process                                 │
│  - Runs as background process (detached)       │
│  - Maintains WebSocket connection              │
│  - Processes commit queue                      │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  Services                                       │
│  ├── AuthService     - Token management         │
│  ├── ApiService      - REST calls to Stint      │
│  ├── WebSocketService - Reverb connection       │
│  ├── GitService      - Local git operations     │
│  └── ProjectService  - Project linking          │
└─────────────────────────────────────────────────┘
```

## Configuration

Stored in `~/.config/stint/config.json`:

```json
{
  "apiUrl": "https://stint.app",
  "wsUrl": "wss://stint.app/reverb",
  "token": "encrypted_token_here",
  "machineId": "uuid-generated-on-first-run",
  "machineName": "Gowelle-MacBook",
  "projects": {
    "/Users/gowelle/code/myapp": {
      "projectId": "01HQ...",
      "linkedAt": "2024-01-15T10:00:00Z"
    }
  }
}
```

## File Structure

```
stint-agent/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── commands/
│   │   ├── login.ts
│   │   ├── logout.ts
│   │   ├── daemon.ts
│   │   ├── link.ts
│   │   ├── sync.ts
│   │   └── commit.ts
│   ├── daemon/
│   │   ├── index.ts          # Daemon process entry
│   │   ├── queue.ts          # Commit queue processor
│   │   └── watcher.ts        # Optional: file watcher for auto-sync
│   ├── services/
│   │   ├── auth.ts
│   │   ├── api.ts
│   │   ├── websocket.ts
│   │   ├── git.ts
│   │   └── project.ts
│   ├── utils/
│   │   ├── config.ts
│   │   ├── logger.ts
│   │   └── crypto.ts
│   └── types/
│       └── index.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

## Core Services

### AuthService

```typescript
interface AuthService {
  // Store token securely (encrypted in config)
  saveToken(token: string): Promise<void>;
  
  // Retrieve and decrypt token
  getToken(): Promise<string | null>;
  
  // Remove stored credentials
  clearToken(): Promise<void>;
  
  // Validate token with server
  validateToken(): Promise<User | null>;
  
  // Generate machine ID on first run
  getMachineId(): string;
}
```

### ApiService

```typescript
interface ApiService {
  // Agent session
  connect(): Promise<AgentSession>;
  disconnect(): Promise<void>;
  heartbeat(): Promise<void>;
  
  // Commits
  getPendingCommits(projectId: string): Promise<PendingCommit[]>;
  markCommitExecuted(commitId: string, sha: string): Promise<Commit>;
  markCommitFailed(commitId: string, error: string): Promise<void>;
  
  // Project sync
  syncProject(projectId: string, data: RepoInfo): Promise<void>;
  
  // Linked projects
  getLinkedProjects(): Promise<Project[]>;
}
```

### GitService

```typescript
interface GitService {
  // Check if directory is a git repo
  isRepo(path: string): Promise<boolean>;
  
  // Get repo info
  getRepoInfo(path: string): Promise<RepoInfo>;
  
  // Execute commit
  stageAll(path: string): Promise<void>;
  stageFiles(path: string, files: string[]): Promise<void>;
  commit(path: string, message: string): Promise<string>; // returns SHA
  
  // Branch operations
  getCurrentBranch(path: string): Promise<string>;
  getBranches(path: string): Promise<Branch[]>;
  
  // Status
  getStatus(path: string): Promise<GitStatus>;
}

interface RepoInfo {
  currentBranch: string;
  branches: string[];
  remoteUrl: string | null;
  status: GitStatus;
  lastCommitSha: string;
  lastCommitMessage: string;
  lastCommitDate: string;
}

interface GitStatus {
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}
```

### WebSocketService

```typescript
interface WebSocketService {
  // Connection
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  
  // Subscribe to user channel
  subscribeToUserChannel(userId: string): void;
  
  // Event handlers
  onCommitApproved(handler: (commit: PendingCommit) => void): void;
  onProjectUpdated(handler: (project: Project) => void): void;
  onDisconnect(handler: () => void): void;
}
```

## WebSocket Events

### Incoming (from server)

```typescript
// Commit approved and ready for execution
interface CommitApprovedEvent {
  event: 'commit.approved';
  data: {
    commit: PendingCommit;
    project: Project;
  };
}

// Force sync request
interface SyncRequestedEvent {
  event: 'sync.requested';
  data: {
    projectId: string;
  };
}
```

### Outgoing (to server)

```typescript
// Sent on successful commit
interface CommitExecutedEvent {
  event: 'commit.executed';
  data: {
    commitId: string;
    sha: string;
    branch: string;
  };
}

// Sent on commit failure
interface CommitFailedEvent {
  event: 'commit.failed';
  data: {
    commitId: string;
    error: string;
  };
}
```

## Daemon Behavior

### Startup Flow

```
1. Load config
2. Validate token with API
3. Register agent session (POST /api/agent/connect)
4. Connect to WebSocket
5. Subscribe to user channel
6. Start heartbeat interval (every 30s)
7. Process any queued commits
8. Listen for new events
```

### Commit Execution Flow

```
1. Receive CommitApproved event (or poll GET /api/agent/pending-commits)
2. Find linked project by projectId
3. Verify project path exists and is git repo
4. Get current git status
5. If uncommitted changes exist:
   a. Stage all changes (or specific files if specified)
   b. Execute commit with provided message
   c. Capture SHA
6. Report success to API (POST /api/agent/commits/{id}/executed)
7. Broadcast CommitExecuted event
```

### Error Handling

- **Network failure**: Retry with exponential backoff (max 5 attempts)
- **Git failure**: Report to API with error details, don't retry
- **Auth failure**: Clear token, prompt re-login
- **Project not found**: Report to API, suggest unlinking

## Security Considerations

1. **Token storage**: Encrypt token at rest using machine-specific key
2. **Token scope**: Agent tokens should have limited abilities (no team management)
3. **Path validation**: Never execute git commands outside linked directories
4. **Message sanitization**: Validate commit messages before execution
5. **Rate limiting**: Respect server rate limits on API calls

## Logging

Log to `~/.config/stint/logs/`:
- `agent.log` - General operations
- `error.log` - Errors only
- Rotate logs daily, keep 7 days

Log format:
```
[2024-01-15T10:30:00.000Z] INFO  [websocket] Connected to wss://stint.app/reverb
[2024-01-15T10:30:05.000Z] INFO  [commit] Executing commit 01HQ... for project myapp
[2024-01-15T10:30:06.000Z] INFO  [git] Staged 3 files in /Users/gowelle/code/myapp
[2024-01-15T10:30:06.000Z] INFO  [git] Committed: abc123def
[2024-01-15T10:30:07.000Z] INFO  [api] Reported commit execution to server
```

## Package.json

```json
{
  "name": "@stint/agent",
  "version": "0.1.0",
  "description": "Local agent for Stint - Project Assistant",
  "bin": {
    "stint": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "lint": "eslint src",
    "test": "vitest"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "conf": "^12.0.0",
    "simple-git": "^3.22.0",
    "ws": "^8.16.0",
    "node-fetch": "^3.3.2",
    "ora": "^8.0.1",
    "chalk": "^5.3.0",
    "open": "^10.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/ws": "^8.5.10",
    "tsup": "^8.0.1",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

## tsup.config.ts

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  minify: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
```

## Implementation Order

### Phase 1: Core CLI
1. Project setup with TypeScript + tsup
2. Config service (read/write ~/.config/stint/)
3. Basic commands: login, logout, whoami
4. API service with token auth

### Phase 2: Git Operations
1. GitService with simple-git
2. link/unlink commands
3. status command
4. sync command

### Phase 3: Daemon
1. Daemon process management (start/stop/status)
2. Heartbeat loop
3. Logging setup

### Phase 4: WebSocket
1. WebSocket connection to Reverb
2. Channel subscription
3. Event handlers

### Phase 5: Commit Execution
1. Commit queue processor
2. Stage and commit flow
3. Error reporting

### Phase 6: Polish
1. Retry logic with backoff
2. Better error messages
3. Progress indicators (ora)
4. Color output (chalk)
