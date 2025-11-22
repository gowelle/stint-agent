import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'daemon/runner': 'src/daemon/runner.ts',
    },
    format: ['esm'],
    target: 'node20',
    clean: true,
    minify: false,
});
