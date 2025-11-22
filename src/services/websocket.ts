// WebSocket Service - Phase 4
// This service will handle WebSocket connections to Reverb

import { PendingCommit, Project } from '../types/index.js';

class WebSocketServiceImpl {
    async connect(): Promise<void> {
        // TODO: Implement in Phase 4
        throw new Error('Not implemented yet - Phase 4');
    }

    disconnect(): void {
        // TODO: Implement in Phase 4
        throw new Error('Not implemented yet - Phase 4');
    }

    isConnected(): boolean {
        // TODO: Implement in Phase 4
        return false;
    }

    subscribeToUserChannel(userId: string): void {
        // TODO: Implement in Phase 4
        throw new Error('Not implemented yet - Phase 4');
    }

    onCommitApproved(handler: (commit: PendingCommit, project: Project) => void): void {
        // TODO: Implement in Phase 4
        throw new Error('Not implemented yet - Phase 4');
    }

    onProjectUpdated(handler: (project: Project) => void): void {
        // TODO: Implement in Phase 4
        throw new Error('Not implemented yet - Phase 4');
    }

    onDisconnect(handler: () => void): void {
        // TODO: Implement in Phase 4
        throw new Error('Not implemented yet - Phase 4');
    }
}

export const websocketService = new WebSocketServiceImpl();
