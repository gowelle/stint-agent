import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { config } from './config.js';

describe('Config', () => {
    const originalEnv = process.env;
    let originalReverbAppKey: string | undefined;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
        // Save original reverbAppKey to restore after test
        originalReverbAppKey = config.getReverbAppKey();
    });

    afterEach(() => {
        process.env = originalEnv;
        // Restore original reverbAppKey if it was set
        if (originalReverbAppKey) {
            config.set('reverbAppKey', originalReverbAppKey);
        }
    });

    it('should prioritize REVERB_APP_KEY from env', () => {
        process.env.REVERB_APP_KEY = 'env-key';
        config.set('reverbAppKey', 'test-config-key');

        expect(config.getReverbAppKey()).toBe('env-key');
    });

    it('should fallback to config key if env key missing', () => {
        delete process.env.REVERB_APP_KEY;
        delete process.env.STINT_REVERB_APP_KEY;
        config.set('reverbAppKey', 'test-config-key');

        expect(config.getReverbAppKey()).toBe('test-config-key');
    });

    it('should use STINT_REVERB_APP_KEY if REVERB_APP_KEY missing', () => {
        delete process.env.REVERB_APP_KEY;
        process.env.STINT_REVERB_APP_KEY = 'stint-env-key';
        config.set('reverbAppKey', 'test-config-key');

        expect(config.getReverbAppKey()).toBe('stint-env-key');
    });

    it('should construct wsUrl with env key', () => {
        process.env.REVERB_APP_KEY = 'ws-env-key';
        config.setEnvironment('production');

        const url = config.getWsUrl();
        expect(url).toContain('/app/ws-env-key');
    });
});
