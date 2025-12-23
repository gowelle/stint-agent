# Manual E2E Testing Guide - Install & Autostart

This guide provides step-by-step procedures for manually testing the `stint install` and `stint uninstall` commands on each supported platform.

## Prerequisites

- Stint CLI installed and authenticated (`stint login`)
- Administrator/elevated permissions (Windows only)
- Access to system logs and configuration

## Windows Testing

### Installation Test

```powershell
# 1. Install
stint install

# Expected output:
# ✓ Stint agent configured to start on login
# Registered Task Scheduler task: StintAgentDaemon

# 2. Verify task exists
schtasks /Query /TN "StintAgentDaemon" /FO LIST

# Expected: Task should be listed with details

# 3. Verify task configuration
schtasks /Query /TN "StintAgentDaemon" /XML

# Expected: Should show ONLOGON trigger and correct command

# 4. Test autostart (requires reboot)
# - Reboot the system
# - After login, check if daemon is running:
tasklist | findstr node

# Expected: Node process running stint daemon

# 5. Check logs
type %USERPROFILE%\.config\stint\logs\daemon.log

# Expected: Daemon started successfully
```

### Uninstallation Test

```powershell
# 1. Uninstall
stint uninstall

# Expected output:
# Stint agent removed from system startup

# 2. Verify task is removed
schtasks /Query /TN "StintAgentDaemon"

# Expected: ERROR: The system cannot find the file specified.

# 3. Verify no autostart after reboot
# - Reboot the system
# - Check if daemon is NOT running:
tasklist | findstr node

# Expected: No stint daemon process
```

## macOS Testing

### Installation Test

```bash
# 1. Install
stint install

# Expected output:
# ✓ Stint agent configured to start on login
# Created LaunchAgent: ~/Library/LaunchAgents/codes.stint.agent.plist

# 2. Verify plist file exists
ls -la ~/Library/LaunchAgents/codes.stint.agent.plist

# Expected: File should exist

# 3. Verify plist content
cat ~/Library/LaunchAgents/codes.stint.agent.plist

# Expected: Valid XML with correct program arguments

# 4. Verify LaunchAgent is loaded
launchctl list | grep stint

# Expected: codes.stint.agent should be listed

# 5. Test autostart (requires logout/login)
# - Log out and log back in
# - Check if daemon is running:
ps aux | grep "stint.*daemon"

# Expected: Daemon process should be running

# 6. Check logs
tail -f ~/.config/stint/logs/launchd.log

# Expected: Daemon started successfully
```

### Uninstallation Test

```bash
# 1. Uninstall
stint uninstall

# Expected output:
# Stint agent removed from system startup

# 2. Verify plist is removed
ls ~/Library/LaunchAgents/codes.stint.agent.plist

# Expected: No such file or directory

# 3. Verify LaunchAgent is unloaded
launchctl list | grep stint

# Expected: No results

# 4. Verify no autostart after logout/login
# - Log out and log back in
# - Check if daemon is NOT running:
ps aux | grep "stint.*daemon"

# Expected: No daemon process
```

## Linux Testing

### Installation Test

```bash
# 1. Install
stint install

# Expected output:
# ✓ Stint agent configured to start on login
# Created systemd user service: stint-agent.service

# 2. Verify service file exists
ls -la ~/.config/systemd/user/stint-agent.service

# Expected: File should exist

# 3. Verify service content
cat ~/.config/systemd/user/stint-agent.service

# Expected: Valid systemd unit file

# 4. Verify service is enabled
systemctl --user is-enabled stint-agent.service

# Expected: enabled

# 5. Verify service is running
systemctl --user status stint-agent.service

# Expected: active (running)

# 6. Test autostart (requires logout/login or reboot)
# - Log out and log back in (or reboot)
# - Check service status:
systemctl --user status stint-agent.service

# Expected: active (running)

# 7. Check logs
journalctl --user -u stint-agent.service -f

# Expected: Daemon started successfully
```

### Uninstallation Test

```bash
# 1. Uninstall
stint uninstall

# Expected output:
# Stint agent removed from system startup

# 2. Verify service is stopped
systemctl --user status stint-agent.service

# Expected: inactive (dead) or Unit not found

# 3. Verify service file is removed
ls ~/.config/systemd/user/stint-agent.service

# Expected: No such file or directory

# 4. Verify no autostart after logout/login
# - Log out and log back in
# - Check service status:
systemctl --user status stint-agent.service

# Expected: Unit stint-agent.service could not be found
```

## Common Issues & Troubleshooting

### Windows

**Issue**: "Access is denied" error
- **Solution**: Run PowerShell as Administrator (Right-click → Run as administrator)

**Issue**: Task exists but daemon doesn't start
- **Solution**: Check task configuration with `schtasks /Query /TN "StintAgentDaemon" /XML`
- Verify the command path is correct

### macOS

**Issue**: LaunchAgent not loading
- **Solution**: Check plist syntax with `plutil -lint ~/Library/LaunchAgents/codes.stint.agent.plist`
- Manually load with `launchctl load ~/Library/LaunchAgents/codes.stint.agent.plist`

**Issue**: Permission denied errors
- **Solution**: Ensure plist file has correct permissions: `chmod 644 ~/Library/LaunchAgents/codes.stint.agent.plist`

### Linux

**Issue**: systemd service fails to start
- **Solution**: Check service status with `systemctl --user status stint-agent.service`
- View logs with `journalctl --user -u stint-agent.service`
- Verify service file syntax

**Issue**: Service doesn't start on login
- **Solution**: Ensure lingering is enabled: `loginctl enable-linger $USER`

## Test Checklist

Use this checklist to track testing progress:

### Windows
- [ ] Installation creates task
- [ ] Task configuration is correct
- [ ] Daemon starts on login
- [ ] Uninstallation removes task
- [ ] No daemon after uninstall + reboot

### macOS
- [ ] Installation creates plist
- [ ] Plist content is valid
- [ ] LaunchAgent loads successfully
- [ ] Daemon starts on login
- [ ] Uninstallation removes plist
- [ ] No daemon after uninstall + logout/login

### Linux
- [ ] Installation creates service file
- [ ] Service file content is valid
- [ ] Service is enabled and running
- [ ] Daemon starts on login
- [ ] Uninstallation removes service
- [ ] No daemon after uninstall + logout/login

## Reporting Issues

When reporting issues, include:
1. Platform and version (e.g., Windows 11, macOS 14, Ubuntu 22.04)
2. Command output (full error messages)
3. Relevant log files
4. Steps to reproduce
