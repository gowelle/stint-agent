import Conf from 'conf';
import { Config, LinkedProject } from '../types/index.js';
import { createHash } from 'crypto';
import os from 'os';

/**
 * Generate a stable machine ID based on hostname, username, and platform.
 * This ensures the ID stays consistent even if config is reset.
 */
function generateStableMachineId(): string {
    const machineInfo = [
        os.hostname(),
        os.userInfo().username,
        os.platform(),
        os.arch(),
    ].join('-');

    const hash = createHash('sha256').update(machineInfo).digest('hex');
    // Format as UUID-like string for consistency
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

const DEFAULT_CONFIG: Partial<Config> = {
    apiUrl: 'https://stint.codes',
    wsUrl: 'wss://stint.codes/reverb',
    reverbAppKey: 'wtn6tu6lirfv6yflujk7',
    projects: {},
    notifications: {
        enabled: true,
    },
    autoCheckUpdates: true,
    lastUpdateCheck: null,
};

class ConfigManager {
    private conf: Conf<Config>;

    constructor() {
        this.conf = new Conf<Config>({
            projectName: 'stint',
            defaults: {
                ...DEFAULT_CONFIG,
                machineId: generateStableMachineId(),
                machineName: os.hostname(),
            } as Config,
        });
    }

    get<K extends keyof Config>(key: K): Config[K] {
        return this.conf.get(key);
    }

    set<K extends keyof Config>(key: K, value: Config[K]): void {
        this.conf.set(key, value);
    }

    getAll(): Config {
        return this.conf.store;
    }

    clear(): void {
        this.conf.clear();
    }

    // Token management
    getToken(): string | undefined {
        return this.conf.get('token');
    }

    setToken(token: string): void {
        this.conf.set('token', token);
    }

    clearToken(): void {
        this.conf.delete('token');
    }

    // Machine info
    getMachineId(): string {
        return this.conf.get('machineId');
    }

    getMachineName(): string {
        return this.conf.get('machineName');
    }

    // Normalize path to use forward slashes for consistent storage/lookup
    private normalizePath(p: string): string {
        return p.replace(/\\/g, '/');
    }

    // Project management
    getProjects(): Record<string, LinkedProject> {
        return this.conf.get('projects') || {};
    }

    getProject(path: string): LinkedProject | undefined {
        const projects = this.getProjects();
        const normalizedPath = this.normalizePath(path);
        return projects[normalizedPath];
    }

    setProject(path: string, project: LinkedProject): void {
        const projects = this.getProjects();
        const normalizedPath = this.normalizePath(path);
        projects[normalizedPath] = project;
        this.conf.set('projects', projects);
    }

    removeProject(path: string): void {
        const projects = this.getProjects();
        const normalizedPath = this.normalizePath(path);
        delete projects[normalizedPath];
        this.conf.set('projects', projects);
    }

    // API URLs
    getApiUrl(): string {
        return this.conf.get('apiUrl');
    }

    getWsUrl(): string {
        const environment = this.getEnvironment();
        // Use the centralized getter to ensure env vars are checked
        const reverbAppKey = this.getReverbAppKey();

        // Build URL based on environment
        let baseUrl: string;
        if (environment === 'development') {
            baseUrl = 'ws://localhost:8080';
        } else {
            // Production: use configured wsUrl or default
            baseUrl = this.conf.get('wsUrl') || 'wss://stint.codes/reverb';
        }

        // If reverbAppKey is provided, construct Laravel Reverb URL pattern
        if (reverbAppKey && reverbAppKey.trim() !== '') {
            // Remove trailing slash from baseUrl if present
            const cleanBaseUrl = baseUrl.replace(/\/$/, '');
            // Remove /reverb path if present (since we're using /app/{key} format)
            const baseWithoutReverb = cleanBaseUrl.replace(/\/reverb$/, '');
            return `${baseWithoutReverb}/app/${reverbAppKey}`;
        }

        // Backward compatibility: ensure /reverb path exists if not already present
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        if (!cleanBaseUrl.includes('/reverb')) {
            return `${cleanBaseUrl}/reverb`;
        }
        return cleanBaseUrl;
    }

    // Environment management
    getEnvironment(): 'development' | 'production' {
        // Check config first (allows manual override)
        const configEnv = this.conf.get('environment');
        if (configEnv === 'development' || configEnv === 'production') {
            return configEnv;
        }

        // Fall back to NODE_ENV
        const nodeEnv = process.env.NODE_ENV;
        if (nodeEnv === 'development' || nodeEnv === 'dev') {
            return 'development';
        }

        // Default to production
        return 'production';
    }

    setEnvironment(environment: 'development' | 'production'): void {
        this.conf.set('environment', environment);
    }

    // Reverb App Key management
    getReverbAppKey(): string | undefined {
        // Prioritize environment variables for security
        return process.env.REVERB_APP_KEY ||
            process.env.STINT_REVERB_APP_KEY ||
            this.conf.get('reverbAppKey');
    }

    setReverbAppKey(reverbAppKey: string): void {
        this.conf.set('reverbAppKey', reverbAppKey);
    }

    // Notification management
    areNotificationsEnabled(): boolean {
        const notifConfig = this.conf.get('notifications');
        return notifConfig?.enabled ?? true; // Default to enabled
    }

    setNotificationsEnabled(enabled: boolean): void {
        this.conf.set('notifications', { enabled });
    }
}

export const config = new ConfigManager();
