import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@aism/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Preview is served from a generated host, so accept it.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        configure: (proxy) => {
          // The browser's Origin is the preview host; the API only trusts its own
          // origin in dev. Rewriting mirrors a same-origin production deployment.
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('origin', apiTarget);
          });
        },
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
