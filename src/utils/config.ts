import Conf from 'conf';
import { Config, LinkedProject } from '../types/index.js';
import { randomUUID } from 'crypto';
import os from 'os';

const DEFAULT_CONFIG: Partial<Config> = {
    apiUrl: 'https://stint.codes',
    wsUrl: 'wss://stint.codes/reverb',
    reverbAppKey: '',
    projects: {},
};

class ConfigManager {
    private conf: Conf<Config>;

    constructor() {
        this.conf = new Conf<Config>({
            projectName: 'stint',
            defaults: {
                ...DEFAULT_CONFIG,
                machineId: randomUUID(),
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

    // Project management
    getProjects(): Record<string, LinkedProject> {
        return this.conf.get('projects') || {};
    }

    getProject(path: string): LinkedProject | undefined {
        const projects = this.getProjects();
        return projects[path];
    }

    setProject(path: string, project: LinkedProject): void {
        const projects = this.getProjects();
        projects[path] = project;
        this.conf.set('projects', projects);
    }

    removeProject(path: string): void {
        const projects = this.getProjects();
        delete projects[path];
        this.conf.set('projects', projects);
    }

    // API URLs
    getApiUrl(): string {
        return this.conf.get('apiUrl');
    }

    getWsUrl(): string {
        const environment = this.getEnvironment();
        const reverbAppKey = this.conf.get('reverbAppKey');

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
        return this.conf.get('reverbAppKey');
    }

    setReverbAppKey(reverbAppKey: string): void {
        this.conf.set('reverbAppKey', reverbAppKey);
    }
}

export const config = new ConfigManager();
