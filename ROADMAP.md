# Stint Agent - Product Roadmap

## Executive Summary
The `stint-agent` is a critical component of the Stint ecosystem, serving as the bridge between the local development environment and the Stint web application. Having successfully reached feature parity with the initial specifications (Phases 1-5 completed, Phase 6 in progress), we are now entering a phase of stabilization, refinement, and expansion.

## 1. Immediate Priorities (v1.1.0 - The "Stability" Release)
**Focus:** Reliability, Testing, and User Feedback Loop.

*   **Comprehensive Test Coverage**:
    *   [ ] Achieve >90% code coverage for core services (`GitService`, `ApiService`, `WebSocketService`).
    *   [ ] Add integration tests for the full "Command -> Queue -> Execution" flow.
    *   [ ] Implement E2E tests for the `install` and `autostart` flows on Windows, macOS, and Linux.
*   **Error Handling & recovery**:
    *   [ ] Improve exponential backoff for WebSocket reconnection strategies.
    *   [ ] Implement "Circuit Breaker" pattern for API calls to prevent cascading failures.
    *   [ ] Enhance `git` error parsing to provide human-readable suggestions (e.g., "Merge conflict detected" instead of raw git output).
*   **Documentation**:
    *   [ ] complete inline code documentation (JSDoc).
    *   [ ] Create a troubleshooting guide for common connection/daemon issues.

## 2. Short-term Goals (v1.2.0 - The "Experience" Release)
**Focus:** Developer Experience (DX) and Ease of Use.

*   **Enhanced CLI UX**:
    *   [ ] Add interactive "TUI" elements for `stint status` (dashboard view).
    *   [ ] Improve progress indicators for long-running operations (sync, large commits).
    *   [ ] Add `stint doctor` command to diagnose environment issues (permissions, git version, network checks).
*   **Update Mechanism Refinement**:
    *   [ ] fully test the self-update mechanism across all platforms.
    *   [ ] Implement release channels (stable vs. beta/insider) for the CLI.
*   **Daemon Management**:
    *   [ ] Improve `stint daemon logs` with filtering and search capabilities.
    *   [ ] Add resource usage monitoring (CPU/RAM) to the daemon status.

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

## 4. Long-term Vision
**Focus:** Ecosystem expansion.

*   **IDE Integrations**: Native extensions for VS Code and JetBrains that communicate with the local daemon.
*   **Multi-Repo Orchestration**: Ability to manage dependencies across linked microservice repositories.
*   **Headless Mode**: "CI/CD" mode for running Stint agent in automated environments.

## Maintenance & Housekeeping
*   **Dependency Management**: Monthly audit of npm dependencies (automate with Dependabot/Renovate).
*   **Performance**: Periodic profiling of the daemon process to ensure minimal footprint.
*   **Tech Debt**: Refactor `GitService` to decouple it further from `simple-git` for easier mocking and potential replacement.
