# Stint Agent

A lightweight Node.js CLI daemon that runs on the developer's machine. It bridges the gap between the Stint web app and local git repositories, enabling commit execution and repo status syncing.

## Features

- 🔐 Secure authentication with OAuth
- 🔄 Real-time WebSocket connection to Stint
- 📦 Automatic commit execution
- 🔍 Repository status syncing
- 🖥️ Background daemon process
- 📝 Comprehensive logging

## Installation

```bash
npm install -g @stint/agent
# or
pnpm add -g @stint/agent
```

## Quick Start

```bash
# Authenticate with Stint
stint login

# Check your authentication status
stint whoami

# Link a project (Phase 2)
cd /path/to/your/project
stint link

# Start the daemon (Phase 3)
stint daemon start

# Check daemon status
stint daemon status
```

## Commands

### Authentication

- `stint login` - Authenticate with Stint (opens browser for OAuth)
- `stint logout` - Remove stored credentials
- `stint whoami` - Show current user and machine information

### Daemon

- `stint daemon start` - Start background daemon
- `stint daemon stop` - Stop daemon gracefully
- `stint daemon status` - Check if daemon is running
- `stint daemon logs [--lines N]` - View daemon logs (default: 50 lines)
- `stint daemon restart` - Restart the daemon

### Project Management

- `stint link` - Link current directory to a Stint project (interactive)
- `stint unlink [--force]` - Remove project link (with confirmation)
- `stint status` - Show project, git, auth, and daemon status
- `stint sync` - Manually sync repository information to server

### Commit Operations

- `stint commits` - List pending commits for this repository
- `stint commit <id>` - Execute a specific pending commit

## Complete Workflow Example

```bash
# 1. Install and authenticate
npm install -g @stint/agent
stint login

# 2. Link your project
cd /path/to/your/project
stint link

# 3. Start the daemon
stint daemon start

# 4. Check status
stint status

# 5. View daemon logs (optional)
stint daemon logs

# Now commits approved in the web app will execute automatically!

# Manual operations:
stint commits              # List pending commits
stint commit abc123        # Execute specific commit
stint sync                 # Sync repo status
stint daemon stop          # Stop daemon when done
```

## Troubleshooting

### "Not authenticated" error

Run `stint login` to authenticate with your Stint account.

### "Repository has uncommitted changes"

The agent requires a clean repository to execute commits. Run `git status` to see changes, then either commit or stash them:

```bash
git status                 # See what's changed
git stash                  # Temporarily stash changes
# or
git add .
git commit -m "message"    # Commit your changes
```

### Daemon won't start

1. Check if already running: `stint daemon status`
2. Check logs: `stint daemon logs`
3. Try stopping first: `stint daemon stop`
4. Then start again: `stint daemon start`

### WebSocket connection issues

Check your network connection and firewall settings. The agent needs to connect to `wss://stint.codes/reverb`.

### "Project not linked" error

Make sure you're in the correct directory and have linked it:

```bash
cd /path/to/your/project
stint link
```

## Development

### Prerequisites

- Node.js 20+
- pnpm (recommended) or npm

### Setup

```bash
# Clone the repository
git clone https://github.com/gowelle/stint-agent.git
cd agent

# Install dependencies
pnpm install

# Build the project
pnpm build

# Run in development mode
pnpm dev
```

### Project Structure

```
stint-agent/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── commands/             # Command implementations
│   │   ├── login.ts
│   │   ├── logout.ts
│   │   ├── whoami.ts
│   │   └── ...
│   ├── daemon/               # Daemon process
│   ├── services/             # Core services
│   │   ├── auth.ts
│   │   ├── api.ts
│   │   ├── git.ts
│   │   └── websocket.ts
│   ├── utils/                # Utilities
│   │   ├── config.ts
│   │   ├── logger.ts
│   │   └── crypto.ts
│   └── types/                # TypeScript types
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

### Building

```bash
# Build for production
pnpm build

# Watch mode for development
pnpm dev

# Lint code
pnpm lint

# Run tests
pnpm test
```

## Configuration

Configuration is stored in `~/.config/stint/config.json`:

```json
{
  "apiUrl": "https://stint.codes",
  "wsUrl": "wss://stint.codes/reverb",
  "token": "encrypted_token_here",
  "machineId": "uuid-generated-on-first-run",
  "machineName": "Your-Machine-Name",
  "projects": {
    "/path/to/project": {
      "projectId": "01HQ...",
      "linkedAt": "2024-01-15T10:00:00Z"
    }
  }
}
```

## Logging

Logs are stored in `~/.config/stint/logs/`:

- `agent.log` - General CLI operations
- `daemon.log` - Daemon process logs
- `daemon-error.log` - Daemon errors

Logs are rotated when they reach 10MB, keeping the last 7 files.

## Implementation Phases

- ✅ **Phase 1**: Core CLI & Authentication
  - OAuth login flow
  - Token encryption and storage
  - User and machine identification
  - API service integration

- ✅ **Phase 2**: Git Operations
  - Git repository integration (simple-git)
  - Project linking and management
  - Repository status tracking
  - Manual sync to server

- ✅ **Phase 3**: Daemon Process
  - Background process management
  - PID file handling
  - Heartbeat loop (30s interval)
  - Process lifecycle (start, stop, restart)
  - Log tailing

- ✅ **Phase 4**: WebSocket Integration
  - Real-time connection to Reverb
  - Pusher protocol support
  - User channel subscription
  - Event handlers (commit approval, project updates)
  - Automatic reconnection with exponential backoff

- 🚧 **Phase 5**: Commit Execution
  - Commit queue processing
  - Automatic git staging and commits
  - Execution status reporting
  - Error handling and retry logic

- 🚧 **Phase 6**: Polish & Optimization
  - Enhanced error messages
  - Performance optimizations
  - Additional UX improvements

## Security

- Tokens are encrypted at rest using machine-specific keys
- All API communication uses HTTPS
- WebSocket connections are authenticated
- Git operations are restricted to linked directories

## License

MIT

## Support

For issues and questions, please visit [stint.codes/support](https://stint.codes/support)
