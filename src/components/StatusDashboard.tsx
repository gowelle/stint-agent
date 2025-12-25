import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Panel } from './Panel.js';
import { StatusRow } from './StatusRow.js';
import { projectService } from '../services/project.js';
import { gitService } from '../services/git.js';
import { authService } from '../services/auth.js';
import { validatePidFile } from '../utils/process.js';
import type { LinkedProject } from '../types/index.js';
import type { RepoInfo } from '../types/index.js';

interface DashboardState {
    linkedProject: LinkedProject | null;
    repoInfo: RepoInfo | null;
    user: { name: string; email: string } | null;
    daemonRunning: boolean;
    daemonPid: number | null;
    isRepo: boolean;
    loading: boolean;
    lastRefresh: Date;
    error: string | null;
}

interface StatusDashboardProps {
    cwd: string;
}

/**
 * Interactive TUI dashboard for stint status command.
 * Shows project, git, auth, and daemon status with auto-refresh and keyboard controls.
 */
export function StatusDashboard({ cwd }: StatusDashboardProps): React.ReactElement {
    const { exit } = useApp();
    const [state, setState] = useState<DashboardState>({
        linkedProject: null,
        repoInfo: null,
        user: null,
        daemonRunning: false,
        daemonPid: null,
        isRepo: false,
        loading: true,
        lastRefresh: new Date(),
        error: null,
    });
    const [showHelp, setShowHelp] = useState(false);

    // Fetch all status data
    const refreshStatus = async () => {
        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            const [linkedProject, user, isRepo] = await Promise.all([
                projectService.getLinkedProject(cwd),
                authService.validateToken(),
                gitService.isRepo(cwd),
            ]);

            let repoInfo: RepoInfo | null = null;
            if (isRepo) {
                try {
                    repoInfo = await gitService.getRepoInfo(cwd);
                } catch {
                    // Ignore repo info errors
                }
            }

            const { valid, pid } = validatePidFile();

            setState({
                linkedProject,
                repoInfo,
                user,
                daemonRunning: valid,
                daemonPid: pid,
                isRepo,
                loading: false,
                lastRefresh: new Date(),
                error: null,
            });
        } catch (error) {
            setState(prev => ({
                ...prev,
                loading: false,
                error: (error as Error).message,
            }));
        }
    };

    // Initial load and auto-refresh every 5 seconds
    useEffect(() => {
        refreshStatus();
        const interval = setInterval(refreshStatus, 5000);
        return () => clearInterval(interval);
    }, [cwd]);

    // Keyboard input handling
    useInput((input, key) => {
        if (input === 'q' || key.escape) {
            exit();
        } else if (input === 'r') {
            refreshStatus();
        } else if (input === '?') {
            setShowHelp(prev => !prev);
        }
    });

    const { linkedProject, repoInfo, user, daemonRunning, daemonPid, isRepo, loading, lastRefresh, error } = state;

    return (
        <Box flexDirection="column" padding={1}>
            {/* Header */}
            <Box marginBottom={1}>
                <Text bold color="cyan">╭───────────────────────────────────────────────────╮</Text>
            </Box>
            <Box marginBottom={1}>
                <Text bold color="cyan">│</Text>
                <Text bold>  📊 Stint Status Dashboard                        </Text>
                <Text bold color="cyan">│</Text>
            </Box>
            <Box marginBottom={1}>
                <Text bold color="cyan">╰───────────────────────────────────────────────────╯</Text>
            </Box>

            {/* Error display */}
            {error && (
                <Box marginBottom={1}>
                    <Text color="red">⚠ Error: {error}</Text>
                </Box>
            )}

            {/* Loading indicator */}
            {loading && (
                <Box marginBottom={1}>
                    <Text color="yellow">⟳ Refreshing...</Text>
                </Box>
            )}

            {/* Project Status Panel */}
            <Panel title="Project Status" icon="📦">
                {linkedProject ? (
                    <>
                        <StatusRow label="Status:" value={<Text color="green">✓ Linked</Text>} />
                        <StatusRow label="Project ID:" value={linkedProject.projectId} />
                        <StatusRow label="Linked At:" value={new Date(linkedProject.linkedAt).toLocaleString()} />
                    </>
                ) : (
                    <>
                        <StatusRow label="Status:" value={<Text color="yellow">Not linked</Text>} />
                        <Text color="gray">Run "stint link" to link this directory to a project.</Text>
                    </>
                )}
            </Panel>

            {/* Git Repository Panel */}
            <Panel title="Git Repository" icon="📂">
                {isRepo && repoInfo ? (
                    <>
                        <StatusRow label="Branch:" value={<Text color="cyan">{repoInfo.currentBranch}</Text>} />
                        <StatusRow label="Remote:" value={repoInfo.remoteUrl || <Text color="gray">None</Text>} />
                        <StatusRow
                            label="Last Commit:"
                            value={`${repoInfo.lastCommitSha.substring(0, 7)} - ${repoInfo.lastCommitMessage.substring(0, 40)}${repoInfo.lastCommitMessage.length > 40 ? '...' : ''}`}
                        />
                        {renderGitChanges(repoInfo)}
                    </>
                ) : (
                    <Text color="yellow">Not a git repository</Text>
                )}
            </Panel>

            {/* Authentication Panel */}
            <Panel title="Authentication" icon="🔐">
                {user ? (
                    <>
                        <StatusRow label="Status:" value={<Text color="green">✓ Authenticated</Text>} />
                        <StatusRow label="User:" value={`${user.name} (${user.email})`} />
                        <StatusRow label="Machine:" value={authService.getMachineName()} />
                    </>
                ) : (
                    <>
                        <StatusRow label="Status:" value={<Text color="yellow">Not logged in</Text>} />
                        <Text color="gray">Run "stint login" to authenticate.</Text>
                    </>
                )}
            </Panel>

            {/* Daemon Panel */}
            <Panel title="Daemon" icon="⚙️">
                {daemonRunning ? (
                    <>
                        <StatusRow label="Status:" value={<Text color="green">✓ Running</Text>} />
                        <StatusRow label="PID:" value={String(daemonPid)} />
                    </>
                ) : (
                    <>
                        <StatusRow label="Status:" value={<Text color="yellow">Not running</Text>} />
                        <Text color="gray">Run "stint daemon start" to start the background agent.</Text>
                    </>
                )}
            </Panel>

            {/* Footer with keyboard shortcuts */}
            <Box marginTop={1} flexDirection="column">
                <Text color="gray">{'─'.repeat(50)}</Text>
                <Box>
                    <Text color="gray">Last refresh: {lastRefresh.toLocaleTimeString()}</Text>
                    <Text color="gray"> │ Auto-refresh: 5s</Text>
                </Box>
                <Box marginTop={1}>
                    <Text color="cyan">[q]</Text><Text> Quit  </Text>
                    <Text color="cyan">[r]</Text><Text> Refresh  </Text>
                    <Text color="cyan">[?]</Text><Text> Help</Text>
                </Box>
            </Box>

            {/* Help overlay */}
            {showHelp && (
                <Box
                    flexDirection="column"
                    marginTop={1}
                    borderStyle="round"
                    borderColor="cyan"
                    padding={1}
                >
                    <Text bold color="cyan">Keyboard Shortcuts</Text>
                    <Text>  q, Esc  - Exit dashboard</Text>
                    <Text>  r       - Refresh status immediately</Text>
                    <Text>  ?       - Toggle this help</Text>
                </Box>
            )}
        </Box>
    );
}

/**
 * Render git changes summary
 */
function renderGitChanges(repoInfo: RepoInfo): React.ReactElement {
    const { staged, unstaged, untracked, ahead, behind } = repoInfo.status;
    const totalChanges = staged.length + unstaged.length + untracked.length;

    return (
        <Box flexDirection="column">
            {totalChanges > 0 ? (
                <>
                    <StatusRow
                        label="Changes:"
                        value={<Text color="yellow">{totalChanges} file(s)</Text>}
                    />
                    {staged.length > 0 && (
                        <Box paddingLeft={2}>
                            <Text color="green">Staged:    {staged.length}</Text>
                        </Box>
                    )}
                    {unstaged.length > 0 && (
                        <Box paddingLeft={2}>
                            <Text color="yellow">Unstaged:  {unstaged.length}</Text>
                        </Box>
                    )}
                    {untracked.length > 0 && (
                        <Box paddingLeft={2}>
                            <Text color="gray">Untracked: {untracked.length}</Text>
                        </Box>
                    )}
                </>
            ) : (
                <StatusRow label="Changes:" value={<Text color="green">Clean working tree</Text>} />
            )}
            {(ahead > 0 || behind > 0) && (
                <StatusRow
                    label="Sync:"
                    value={
                        <Text color="yellow">
                            {ahead > 0 ? `↑${ahead}` : ''} {behind > 0 ? `↓${behind}` : ''}
                        </Text>
                    }
                />
            )}
        </Box>
    );
}
