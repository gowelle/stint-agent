# Stint Agent Features

## Progress Tracking

The agent provides detailed progress feedback for long-running operations using the `ora` spinner library.

### Sync Command Progress

- Shows total file count being analyzed
- Displays current branch and repository information
- Reports server connection status
- Example: `stint sync`

```
✓ Repository sync completed
──────────────────────────────────────────────────────
Files:       15 total (3 staged, 5 modified, 7 untracked)
Project ID:  proj_abc123
Branch:      main
Commit:      abc1234 - Update documentation
Remote:      https://github.com/user/repo.git
```

### Commit Progress

- Shows staged files being committed
- Reports commit execution stages
- Displays final commit details
- Supports partial commit IDs for convenience
- Example: `stint commit <id>`

**Options:**

| Option         | Description                                         |
| -------------- | --------------------------------------------------- |
| `--auto-stage` | Automatically stage files specified in the commit   |
| `--push`       | Push changes to remote after committing             |
| `--force`      | Skip file validation warnings                       |

**Usage Examples:**

```bash
# Execute a commit with full ID
stint commit abc123def456

# Execute with partial ID (first 7 characters)
stint commit abc123d

# Auto-stage expected files and push after commit
stint commit abc123d --auto-stage --push

# Skip file mismatch warnings
stint commit abc123d --force
```

**Output:**

```
✓ Commit executed
──────────────────────────────────────────────────────
Commit ID:  abc123def456
Message:    Update API endpoints
SHA:        def7890
Files:      3 files committed
Pushed:     Yes

Committed files:
  + src/services/api.ts
  + src/types/index.ts
  + tests/api.test.ts
```

## Health Checks

The `stint doctor` command performs comprehensive environment diagnostics.

### Git Environment

- Verifies Git installation and version
- Checks global Git configuration
- Validates repository permissions

### Network Connectivity

- Tests API server connection
- Verifies WebSocket connectivity
- Reports detailed error messages if any service is unreachable

Example: `stint doctor`

```
🔍 Running environment diagnostics...

✓ Git Installation: Git 2.39.2 found
✓ Git Configuration: Git configured for John Doe <john@example.com>
✓ Authentication: Authenticated as john@example.com
✓ API Connectivity: API connection successful
✓ WebSocket Connectivity: WebSocket connection successful

All checks passed! Your environment is healthy.
```

## Update System

### Release Channels

Configured in `package.json`:

- **stable**: Production-ready releases (e.g., 1.2.0)
- **beta**: Pre-release versions (e.g., 1.2.0-beta.1)
- **nightly**: Daily builds (e.g., 1.2.0-nightly.20251225)

### Update Command

- Supports channel switching: `stint update --channel <channel>`
- Automatically restarts daemon after update
- Validates version compatibility

### Testing Scripts

Cross-platform update testing:

- `scripts/test-update-windows.ps1`: Windows testing
- `scripts/test-update-unix.sh`: macOS/Linux testing
- `scripts/test-update.js`: Cross-platform test runner

Example: `npm run test:update`

```
🚀 Running update tests on win32
Initial version: 1.0.0
Target version: latest

✓ Initial version installed successfully
✓ Daemon started successfully
✓ Update command completed
✓ Update verification successful
New version: 1.2.0

✨ Update test completed successfully
```

## Daemon Management

### Log Management

The `stint daemon logs` command provides powerful log filtering and search:

```bash
# View last 50 lines
stint daemon logs

# Filter by severity
stint daemon logs -l ERROR

# Filter by time range
stint daemon logs -s 2h      # Last 2 hours
stint daemon logs -s 1d      # Last day
stint daemon logs -u 30m     # Until 30 minutes ago

# Search logs
stint daemon logs --search "connection failed"

# Follow logs in real-time
stint daemon logs -f

# Combine filters
stint daemon logs -l ERROR -c websocket -s 1h
```

### Resource Monitoring

The `stint daemon status` command shows process statistics:

```
⚙️  Daemon Status:
──────────────────────────────────────────────────────
Status:      ✓ Running
PID:         12345
PID File:    /home/user/.config/stint/daemon.pid
Logs:        /home/user/.config/stint/logs/daemon.log

📊 Resource Usage:
──────────────────────────────────────────────────────
CPU:         2.5%
Memory:      45.8 MB
Threads:     4
Uptime:      2d 5h 30m
```

### Cross-Platform Support

Resource monitoring is implemented for:

- Linux: Uses `/proc` filesystem
- macOS: Uses `ps` command
- Windows: Uses `wmic` command

## Usage Tips

1. **Regular Health Checks**

   ```bash
   stint doctor
   ```

   Run this periodically to ensure your environment is healthy.

2. **Log Analysis**

   ```bash
   # Check for errors in the last hour
   stint daemon logs -l ERROR -s 1h

   # Monitor real-time logs during development
   stint daemon logs -f
   ```

3. **Update Management**

   ```bash
   # Stay on stable channel
   stint update --channel stable

   # Try beta features
   stint update --channel beta
   ```

4. **Resource Monitoring**
   ```bash
   # Check daemon health
   stint daemon status
   ```

## Error Handling

The agent provides detailed error messages and logging:

- Console output uses color coding for severity
- Errors are logged to `~/.config/stint/logs/error.log`
- Debug logs can be enabled with `DEBUG=1 stint <command>`

## Configuration

### Release Channels

In `package.json`:

```json
{
  "stint": {
    "channels": {
      "stable": {
        "pattern": "^\\d+\\.\\d+\\.\\d+$",
        "description": "Production-ready releases"
      },
      "beta": {
        "pattern": "^\\d+\\.\\d+\\.\\d+-beta\\.\\d+$",
        "description": "Pre-release versions for testing"
      },
      "nightly": {
        "pattern": "^\\d+\\.\\d+\\.\\d+-nightly\\.\\d{8}$",
        "description": "Nightly builds from main branch"
      }
    },
    "defaultChannel": "stable"
  }
}
```
