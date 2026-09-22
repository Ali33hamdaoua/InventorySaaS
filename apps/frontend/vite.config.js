import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
/**
 * The shared workspace package is built as CommonJS so the NestJS backend
 * can `require()` it. Vite/Rollup can read CJS in dev (esbuild pre-bundle
 * via `optimizeDeps`), but in prod the Rollup builder cannot statically
 * analyse TypeScript's `__exportStar` re-exports and fails with errors like
 * `"loginSchema" is not exported by … shared/dist/index.js`.
 *
 * Fix: short-circuit the resolver to load the original `.ts` source files
 * directly. Vite/esbuild handle them natively in both dev and build modes;
 * the backend keeps using the published `dist/` (via Node `require()`).
 */
var SHARED_SRC = path.resolve(__dirname, '../../packages/shared/src/index.ts');
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            // Order matters: this MUST come before any optimizeDeps include for
            // the same package, otherwise Vite tries to pre-bundle the CJS dist.
            '@inventorymdb/shared': SHARED_SRC,
        },
    },
    // Pnpm symlinks workspace packages. By default Vite would try to follow
    // them and treat the source as external; this keeps them resolvable.
    server: {
        port: 5173,
        fs: {
            allow: [path.resolve(__dirname, '../..')],
        },
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
        },
    },
});
