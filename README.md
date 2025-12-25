# Stint Agent

[![npm version](https://img.shields.io/npm/v/@gowelle/stint-agent.svg)](https://www.npmjs.com/package/@gowelle/stint-agent)
[![npm downloads](https://img.shields.io/npm/dm/@gowelle/stint-agent.svg)](https://www.npmjs.com/package/@gowelle/stint-agent)
[![CI](https://github.com/gowelle/stint-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/gowelle/stint-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)

The official CLI agent for [Stint](https://stint.codes) — a lightweight daemon that bridges the Stint web app and your local git repositories, enabling automatic commit execution and real-time repo syncing.

## Features

- 🔐 Secure authentication with OAuth
- 🔄 Real-time WebSocket connection to Stint
- 📦 Automatic commit execution
- 🔍 Repository status syncing
- 🖥️ Background daemon process
- 📝 Comprehensive logging and filtering
- 📊 Interactive status dashboard
- 🚀 Multiple release channels (stable/beta/nightly)
- 🔍 Built-in environment diagnostics
- 📈 Resource usage monitoring

For detailed feature documentation, see the **[Features Guide](docs/features.md)**.

## Installation

```bash
npm install -g @gowelle/stint-agent
# or
pnpm add -g @gowelle/stint-agent
```

## Quick Start

```bash
# Authenticate with Stint
stint login

# Check your authentication status
stint whoami

# Link a project (or create a new one)
cd /path/to/your/project
stint link

# Start the daemon
stint daemon start

# Check daemon status
stint daemon status
```

## Commands

### General

| Command                       | Description                        |
| ----------------------------- | ---------------------------------- |
| `stint --version`, `stint -V` | Show current agent version         |
| `stint --help`, `stint -h`    | Show help information              |
| `stint update`                | Update agent to the latest version |

### Authentication

| Command        | Description                                       |
| -------------- | ------------------------------------------------- |
| `stint login`  | Authenticate with Stint (opens browser for OAuth) |
| `stint logout` | Remove stored credentials                         |
| `stint whoami` | Show current user and machine information         |

### Daemon Lifecycle

| Command                         | Description                                               |
| ------------------------------- | --------------------------------------------------------- |
| `stint install`                 | Register daemon to run on system startup (Login required) |
| `stint uninstall`               | Remove daemon from system startup                         |
| `stint daemon start`            | Start background daemon manually                          |
| `stint daemon stop`             | Stop daemon gracefully                                    |
| `stint daemon status`           | Check if daemon is running                                |
| `stint daemon logs [--lines N]` | View daemon logs (default: 50 lines)                      |
| `stint daemon restart`          | Restart the daemon                                        |

### Project Management

| Command                      | Description                                                     |
| ---------------------------- | --------------------------------------------------------------- |
| `stint link`                 | Link current directory to a Stint project (or create a new one) |
| `stint unlink [--force]`     | Remove project link                                             |
| `stint status [--dashboard]` | Show status (use `-d` for interactive dashboard)                |
| `stint sync`                 | Manually sync repository information to server                  |

### Commit Operations

| Command                    | Description                                            |
| -------------------------- | ------------------------------------------------------ |
| `stint commits`            | List pending commits for this repository               |
| `stint commit <id>`        | Execute a specific pending commit (supports partial ID)|

**`stint commit` Options:**

| Option         | Description                                         |
| -------------- | --------------------------------------------------- |
| `--auto-stage` | Automatically stage files specified in the commit   |
| `--push`       | Push changes to remote after committing             |
| `--force`      | Skip file validation warnings                       |

## Complete Workflow

```bash
# 1. Install and authenticate
npm install -g @gowelle/stint-agent
stint login

# 2. Link your project
cd /path/to/your/project
stint link

# 3. Start the daemon
stint daemon start

# 4. Check status
stint status

# Now commits approved in the web app will execute automatically!
```

## Troubleshooting

For comprehensive troubleshooting help, see the **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)**.

### Quick Tips

**"Not authenticated" error**

```bash
stint login
```

**Daemon won't start**

```bash
stint daemon status        # Check if already running
stint daemon logs          # Check logs for errors
stint daemon restart       # Restart daemon
```

**For detailed solutions**, including:

- Connection issues (WebSocket, API, Circuit Breaker)
- Daemon problems (crashes, autostart)
- Authentication errors
- Git operation failures
- Platform-specific issues (Windows, macOS, Linux)

See the **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)**.

## Logging

Logs are stored in your system's config directory:

| Platform    | Log Location                        |
| ----------- | ----------------------------------- |
| **macOS**   | `~/.config/stint/logs/`             |
| **Linux**   | `~/.config/stint/logs/`             |
| **Windows** | `%USERPROFILE%\.config\stint\logs\` |

Log files:

- `agent.log` - General CLI operations
- `daemon.log` - Daemon process logs
- `error.log` - Error details

## Development

```bash
git clone https://github.com/gowelle/stint-agent.git
cd stint-agent
pnpm install
pnpm build
pnpm dev    # Watch mode
```

## Security

- Tokens are encrypted at rest using machine-specific keys
- All API communication uses HTTPS
- WebSocket connections are authenticated
- Git operations are restricted to linked directories

## License

MIT © [Gowelle John](https://github.com/gowelle)

## Support

For issues and questions, please [open an issue](https://github.com/gowelle/stint-agent/issues).
