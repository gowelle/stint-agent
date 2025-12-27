import { logger } from '../utils/logger.js';
import semver from 'semver';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

interface VersionInfo {
    current: string;
    latest: string;
    hasUpdate: boolean;
    channel: 'stable' | 'beta';
}

interface NpmRegistryResponse {
    'dist-tags': {
        latest: string;
        beta?: string;
    };
    time: Record<string, string>;
}

interface VersionCache {
    timestamp: number;
    data: NpmRegistryResponse;
}

const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds
const CACHE_FILE = path.join(os.homedir(), '.config', 'stint', 'version-cache.json');
const PACKAGE_NAME = '@gowelle/stint-agent';

/**
 * Version service for checking npm registry and managing updates
 */
class VersionService {
    private currentVersion: string;

    constructor(currentVersion: string) {
        this.currentVersion = currentVersion;
    }

    /**
     * Check if an update is available
     * @param channel - Release channel to check (stable or beta)
     * @returns Version information including update availability
     */
    async checkForUpdates(channel: 'stable' | 'beta' = 'stable'): Promise<VersionInfo> {
        try {
            const registryData = await this.fetchRegistryData();
            let latestVersion: string;

            if (channel === 'beta') {
                // Use beta tag if available, otherwise fall back to latest
                latestVersion = registryData['dist-tags'].beta || registryData['dist-tags'].latest;
                if (!registryData['dist-tags'].beta) {
                    logger.warn('version', 'No beta channel available, using stable');
                }
            } else {
                latestVersion = registryData['dist-tags'].latest;
            }

            // Validate versions before comparison
            if (!latestVersion || !semver.valid(latestVersion)) {
                throw new Error(`Invalid latest version: ${latestVersion}`);
            }
            if (!semver.valid(this.currentVersion)) {
                throw new Error(`Invalid current version: ${this.currentVersion}`);
            }

            const hasUpdate = semver.gt(latestVersion, this.currentVersion);

            logger.info('version', `Current: ${this.currentVersion}, Latest (${channel}): ${latestVersion}, Update available: ${hasUpdate}`);

            return {
                current: this.currentVersion,
                latest: latestVersion,
                hasUpdate,
                channel,
            };
        } catch (error) {
            logger.error('version', 'Failed to check for updates', error as Error);
            throw error;
        }
    }

    /**
     * Get the latest version for a specific channel
     * @param channel - Release channel (stable or beta)
     * @returns Latest version string
     */
    async getLatestVersion(channel: 'stable' | 'beta' = 'stable'): Promise<string> {
        const registryData = await this.fetchRegistryData();
        return channel === 'beta'
            ? (registryData['dist-tags'].beta || registryData['dist-tags'].latest)
            : registryData['dist-tags'].latest;
    }

    /**
     * Fetch registry data from npm, using cache if available
     * @returns Registry response data
     */
    private async fetchRegistryData(): Promise<NpmRegistryResponse> {
        // Try to load from cache first
        const cachedData = this.loadCache();
        if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
            logger.debug('version', 'Using cached registry data');
            return cachedData.data;
        }

        // Fetch fresh data from npm registry
        logger.debug('version', 'Fetching fresh registry data');
        const response = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch registry data: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as NpmRegistryResponse;

        // Save to cache
        this.saveCache(data);

        return data;
    }

    /**
     * Load cached registry data
     * @returns Cached data or null if not available/expired
     */
    private loadCache(): VersionCache | null {
        try {
            if (!fs.existsSync(CACHE_FILE)) {
                return null;
            }

            const content = fs.readFileSync(CACHE_FILE, 'utf8');
            return JSON.parse(content) as VersionCache;
        } catch (error) {
            logger.debug('version', 'Failed to load cache', error as Error);
            return null;
        }
    }

    /**
     * Save registry data to cache
     * @param data - Registry data to cache
     */
    private saveCache(data: NpmRegistryResponse): void {
        try {
            const cacheDir = path.dirname(CACHE_FILE);
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            const cache: VersionCache = {
                timestamp: Date.now(),
                data,
            };

            fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
        } catch (error) {
            logger.debug('version', 'Failed to save cache', error as Error);
            // Non-critical, continue without caching
        }
    }

    /**
     * Clear the version cache
     */
    clearCache(): void {
        try {
            if (fs.existsSync(CACHE_FILE)) {
                fs.unlinkSync(CACHE_FILE);
                logger.debug('version', 'Cache cleared');
            }
        } catch (error) {
            logger.debug('version', 'Failed to clear cache', error as Error);
        }
    }
}

/**
 * Get current package version from package.json
 */
function getCurrentVersion(): string {
    try {
        // Start from current file location and search upwards for package.json
        let currentDir = path.dirname(fileURLToPath(import.meta.url));
        let packageJsonPath: string | null = null;

        // Search up to 5 levels
        for (let i = 0; i < 5; i++) {
            const testPath = path.join(currentDir, 'package.json');
            if (fs.existsSync(testPath)) {
                packageJsonPath = testPath;
                break;
            }
            currentDir = path.dirname(currentDir);
        }

        if (!packageJsonPath) {
            throw new Error('package.json not found');
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return packageJson.version;
    } catch (error) {
        logger.error('version', 'Failed to read package version', error as Error);
        return '0.0.0';
    }
}

// Export singleton instance
export const versionService = new VersionService(getCurrentVersion());
