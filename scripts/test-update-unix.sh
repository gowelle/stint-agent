#!/bin/bash
# Test script for stint-agent update process on macOS/Linux
# This script verifies the update process by:
# 1. Installing a specific version
# 2. Verifying installation
# 3. Running update command
# 4. Verifying new version

set -e

# Default versions
INITIAL_VERSION=${1:-"1.0.0"}
TARGET_VERSION=${2:-"latest"}

echo "🔍 Testing stint-agent update process"
echo "Initial version: $INITIAL_VERSION"
echo "Target version: $TARGET_VERSION"
echo ""

# Helper function to get current version
get_stint_version() {
    stint -v 2>/dev/null || echo "not installed"
}

# Helper function to verify daemon status
check_daemon_status() {
    stint daemon status 2>/dev/null | grep -q "running"
}

# 1. Install initial version
echo "📦 Installing initial version ($INITIAL_VERSION)..."
if ! npm install -g "@gowelle/stint-agent@$INITIAL_VERSION"; then
    echo "❌ Failed to install initial version"
    exit 1
fi

installed_version=$(get_stint_version)
if [ "$installed_version" != "$INITIAL_VERSION" ]; then
    echo "❌ Version mismatch: expected $INITIAL_VERSION, got $installed_version"
    exit 1
fi
echo "✓ Initial version installed successfully"

# 2. Start daemon
echo "🚀 Starting daemon..."
stint daemon start
sleep 2

if ! check_daemon_status; then
    echo "❌ Daemon failed to start"
    exit 1
fi
echo "✓ Daemon started successfully"

# 3. Run update
echo "⚡ Running update..."
if [ "$TARGET_VERSION" = "latest" ]; then
    stint update
else
    npm install -g "@gowelle/stint-agent@$TARGET_VERSION"
fi
sleep 2
echo "✓ Update command completed"

# 4. Verify new version and daemon status
echo "🔍 Verifying update..."
new_version=$(get_stint_version)
if [ "$TARGET_VERSION" != "latest" ] && [ "$new_version" != "$TARGET_VERSION" ]; then
    echo "❌ Version mismatch after update: expected $TARGET_VERSION, got $new_version"
    exit 1
fi

if ! check_daemon_status; then
    echo "❌ Daemon not running after update"
    exit 1
fi

echo "✓ Update verification successful"
echo "New version: $new_version"
echo ""
echo "✨ Update test completed successfully"
