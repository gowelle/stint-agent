import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';

// Read version from package.json at build time
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = packageJson.version;

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'daemon/runner': 'src/daemon/runner.ts',
    },
    format: ['esm'],
    target: 'node20',
    clean: true,
    minify: false,
    define: {
        'process.env.AGENT_VERSION': JSON.stringify(version),
    },
});
