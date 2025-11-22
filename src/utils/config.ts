import Conf from 'conf';
import { Config, LinkedProject } from '../types/index.js';
import { randomUUID } from 'crypto';
import os from 'os';

const DEFAULT_CONFIG: Partial<Config> = {
    apiUrl: 'https://stint.codes',
    wsUrl: 'wss://stint.codes/reverb',
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
        return this.conf.get('wsUrl');
    }
}

export const config = new ConfigManager();
