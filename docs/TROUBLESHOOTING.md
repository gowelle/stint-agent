# Troubleshooting Guide

This guide helps you diagnose and fix common issues with the Stint Agent.

## Table of Contents
- [Connection Issues](#connection-issues)
- [Daemon Issues](#daemon-issues)
- [Authentication Issues](#authentication-issues)
- [Git Operation Issues](#git-operation-issues)
- [Platform-Specific Issues](#platform-specific-issues)

## Connection Issues

### WebSocket Connection Failures

**Symptom:** Agent can't connect to the server, shows "WebSocket disconnected" messages.

**Solutions:**
1. Check your internet connection
2. Verify the API URL is correct: `stint config`
3. Check if firewall is blocking WebSocket connections (port 443)
4. Try reconnecting: `stint daemon restart`

**Logs to check:**
```bash
# View daemon logs
cat ~/.config/stint/logs/daemon.log | grep websocket
```

### API Connectivity Problems

**Symptom:** Commands fail with "API request failed" errors.

**Solutions:**
1. Verify you're logged in: `stint status`
2. Check API endpoint: `stint config`
3. Test connectivity: `curl https://stint.codes/api/user`
4. Re-authenticate: `stint login`

**Circuit Breaker:**
If you see "Circuit breaker is OPEN", the agent has detected repeated API failures and is protecting against cascading failures. Wait 30 seconds and try again.

### Network Timeout Errors

**Symptom:** Operations hang or timeout.

**Solutions:**
1. Check network stability
2. Increase timeout in config (if available)
3. Try on a different network
4. Contact support if issue persists

## Daemon Issues

### Daemon Won't Start

**Symptom:** `stint daemon start` fails or exits immediately.

**Solutions:**
1. Check if already running: `ps aux | grep stint` (Unix) or `tasklist | findstr node` (Windows)
2. Kill existing process and restart
3. Check logs for errors: `cat ~/.config/stint/logs/daemon.log`
4. Verify Node.js is installed: `node --version`
5. Reinstall: `npm install -g @gowelle/stint-agent`

**Common errors:**
- "Port already in use" → Another instance is running
- "Permission denied" → Run with appropriate permissions
- "Module not found" → Reinstall the package

### Daemon Crashes

**Symptom:** Daemon stops unexpectedly.

**Solutions:**
1. Check crash logs: `cat ~/.config/stint/logs/daemon.log`
2. Look for error patterns (memory, unhandled exceptions)
3. Update to latest version: `npm update -g @gowelle/stint-agent`
4. Report issue with logs to support

### Autostart Not Working

**Symptom:** Daemon doesn't start on system boot.

**Platform-specific solutions:**

**Windows:**
```powershell
# Verify task exists
schtasks /Query /TN "StintAgentDaemon"

# Reinstall
stint uninstall
stint install
```

**macOS:**
```bash
# Check LaunchAgent
launchctl list | grep stint

# Verify plist file
cat ~/Library/LaunchAgents/codes.stint.agent.plist

# Reload
launchctl unload ~/Library/LaunchAgents/codes.stint.agent.plist
launchctl load ~/Library/LaunchAgents/codes.stint.agent.plist
```

**Linux:**
```bash
# Check service status
systemctl --user status stint-agent

# View logs
journalctl --user -u stint-agent -n 50

# Restart service
systemctl --user restart stint-agent
```

## Authentication Issues

### Login Failures

**Symptom:** `stint login` fails or shows "Authentication failed".

**Solutions:**
1. Verify credentials are correct
2. Check if account is active at https://stint.codes
3. Clear cached token: `rm ~/.config/stint/auth.json`
4. Try login again: `stint login`

### Token Expiration

**Symptom:** Commands fail with "No authentication token" or "401 Unauthorized".

**Solutions:**
1. Re-login: `stint login`
2. Check token validity: `stint status`
3. Verify system time is correct (tokens are time-sensitive)

### Permission Errors

**Symptom:** "Permission denied" when running commands.

**Solutions:**
1. Check file permissions: `ls -la ~/.config/stint/`
2. Fix permissions: `chmod 600 ~/.config/stint/auth.json`
3. Ensure you own the files: `chown -R $USER ~/.config/stint/`

## Git Operation Issues

### Commit Failures

**Symptom:** `stint commit` fails with git errors.

**Common errors and solutions:**

**"No staged changes to commit"**
```bash
# Stage your changes first
git add <files>
stint commit <id>
```

**"Not a git repository"**
```bash
# Initialize git repo
git init
git remote add origin <url>
```

**"Permission denied (publickey)"**
```bash
# Check SSH keys
ssh -T git@github.com

# Add SSH key to agent
ssh-add ~/.ssh/id_rsa
```

**"Merge conflict detected"**
```bash
# Resolve conflicts manually
git status
# Edit conflicted files
git add <resolved-files>
git commit
```

### Repository Not Found

**Symptom:** "Project is not linked" or "Directory is not a git repository".

**Solutions:**
1. Link the project: `stint link`
2. Verify you're in the correct directory: `pwd`
3. Check git status: `git status`
4. Re-link if needed: `stint unlink && stint link`

### Branch Issues

**Symptom:** "Detached HEAD" or branch-related errors.

**Solutions:**
```bash
# Check current branch
git branch

# Checkout a branch
git checkout main

# Create and checkout new branch
git checkout -b <branch-name>
```

## Platform-Specific Issues

### Windows

**Task Scheduler Issues:**
```powershell
# Must run as Administrator
Right-click PowerShell → Run as administrator
stint install

# Verify task
schtasks /Query /TN "StintAgentDaemon" /V

# Check task history
Get-ScheduledTask -TaskName "StintAgentDaemon" | Get-ScheduledTaskInfo
```

**Path Issues:**
- Ensure Node.js is in PATH
- Use full paths if needed: `"C:\Program Files\nodejs\node.exe"`

### macOS

**LaunchAgent Issues:**
```bash
# Check plist syntax
plutil -lint ~/Library/LaunchAgents/codes.stint.agent.plist

# View logs
tail -f ~/.config/stint/logs/launchd.log

# Permissions
chmod 644 ~/Library/LaunchAgents/codes.stint.agent.plist
```

**Gatekeeper/Security:**
- Allow Node.js in System Preferences → Security & Privacy
- Grant Full Disk Access if needed

### Linux

**systemd Issues:**
```bash
# Enable lingering (keeps services running after logout)
loginctl enable-linger $USER

# Check service file
cat ~/.config/systemd/user/stint-agent.service

# Reload daemon
systemctl --user daemon-reload

# View detailed logs
journalctl --user -u stint-agent -f
```

**Permission Issues:**
```bash
# Ensure service file has correct permissions
chmod 644 ~/.config/systemd/user/stint-agent.service
```

## Getting Help

If you're still experiencing issues:

1. **Check logs:**
   - Daemon: `~/.config/stint/logs/daemon.log`
   - Platform-specific logs (see above)

2. **Gather information:**
   ```bash
   stint --version
   node --version
   stint status
   ```

3. **Report issue:**
   - Include error messages
   - Attach relevant logs
   - Describe steps to reproduce
   - Mention your OS and version

4. **Contact support:**
   - GitHub Issues: https://github.com/gowelle/stint-agent/issues
   - Email: support@stint.codes
   - Documentation: https://stint.codes/docs
