# Stint Agent - Product Roadmap

## Executive Summary
The `stint-agent` is a critical component of the Stint ecosystem, serving as the bridge between the local development environment and the Stint web application. Having successfully reached feature parity with the initial specifications (Phases 1-5 completed), we are now preparing the v1.2.0 "Experience" release.

---

## ✅ Released: v1.1.0 - The "Stability" Release
**Focus:** Reliability, Testing, and User Feedback Loop.

*   **Comprehensive Test Coverage**:
    *   [x] Achieve >90% code coverage for core services (`GitService`, `ApiService`, `WebSocketService`).
    *   [x] Add integration tests for the full "Command -> Queue -> Execution" flow.
    *   [x] Implement E2E tests for the `install` and `autostart` flows on Windows, macOS, and Linux.
*   **Error Handling & Recovery**:
    *   [x] Improve exponential backoff for WebSocket reconnection strategies.
    *   [x] Implement "Circuit Breaker" pattern for API calls to prevent cascading failures.
    *   [x] Enhance `git` error parsing to provide human-readable suggestions.
*   **Documentation**:
    *   [x] Complete inline code documentation (JSDoc).
    *   [x] Create a troubleshooting guide for common connection/daemon issues.

---

## 🚀 Current: v1.2.0 - The "Experience" Release
**Focus:** Developer Experience (DX) and Ease of Use.

### Enhanced CLI UX
*   [x] Add interactive "TUI" elements for `stint status` (dashboard view).
*   [x] Add `stint doctor` command to diagnose environment issues:
    - Git installation and configuration checks
    - Authentication validation
    - API connectivity tests
    - WebSocket connectivity tests
*   [ ] Improve progress indicators for long-running operations (sync, large commits).

### Daemon Management
*   [x] Improve `stint daemon logs` with filtering and search capabilities:
    - Filter by log level (`--level`)
    - Filter by category (`--category`)
    - Time-based filtering (`--since`, `--until`)
    - Text search (`--search`)
    - Follow mode (`--follow`)
*   [x] Add resource usage monitoring (CPU/RAM) to the daemon status:
    - Cross-platform process stats (Linux, macOS, Windows)
    - Memory, CPU, threads, and uptime display

### Update Mechanism
*   [ ] Fully test the self-update mechanism across all platforms.
*   [ ] Implement release channels (stable vs. beta/insider) for the CLI.

### Test Coverage Improvements
*   [x] Added `doctor.test.ts` - 14 tests for doctor command
*   [x] Added `monitor.test.ts` - 6 tests for process monitoring
*   [x] Fixed `daemon.test.ts` - 7 tests for daemon commands
*   [x] Total: 176 tests passing across 16 test files

---

## 3. Mid-term Goals (v2.0.0 - The "Intelligence" Release)
**Focus:** Proactive assistance and deeper integration.

*   **Smart Syncing**:
    *   [ ] Implement "Intelligent Watcher" that reduces sync frequency based on activity patterns.
    *   [ ] Local caching of project state to reduce API load.
*   **Security Hardening**:
    *   [ ] Implement signed commits (GPG/SSH signature support).
    *   [ ] Audit and minimize permission scopes for generated tokens.
    *   [ ] Encrypt local logs containing sensitive repo info.
*   **Extensibility**:
    *   [ ] Plugin system for custom pre/post-commit hooks managed by Stint.

---

## 4. Long-term Vision
**Focus:** Ecosystem expansion.

*   **IDE Integrations**: Native extensions for VS Code and JetBrains that communicate with the local daemon.
*   **Multi-Repo Orchestration**: Ability to manage dependencies across linked microservice repositories.
*   **Headless Mode**: "CI/CD" mode for running Stint agent in automated environments.

---

## Maintenance & Housekeeping
*   **Dependency Management**: Monthly audit of npm dependencies (automate with Dependabot/Renovate).
*   **Performance**: Periodic profiling of the daemon process to ensure minimal footprint.
*   **Tech Debt**: Refactor `GitService` to decouple it further from `simple-git` for easier mocking and potential replacement.

---

## Release History

| Version | Release Date | Highlights |
|---------|--------------|------------|
| v1.0.0  | 2024-12     | Initial release, core functionality |
| v1.1.0  | 2024-12     | Stability release, comprehensive testing |
| v1.2.0  | 2024-12     | Experience release, doctor command, enhanced daemon |
