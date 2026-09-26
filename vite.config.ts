import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import EnvironmentPlugin from 'vite-plugin-environment';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Relative build assets let the same image run below any client path.
  base: './',
  resolve: {
    alias: {
      '@lidojs/design-editor': path.resolve(
        rootDir,
        'src/vendor/design-editor',
      ),
    },
  },
  plugins: [
    react({
      jsxImportSource: '@emotion/react',
      babel: {
        plugins: ['@emotion/babel-plugin'],
      },
    }),
    EnvironmentPlugin(
      {
        API_ENDPOINT: '',
        FONT_API_KEY: '',
      },
      { defineOn: 'process.env' },
    ),
  ],
  server: {
    port: 4200,
    host: true,
    proxy: {
      // The API runs as a separate process (`npm run api`, default port 4201 —
      // see api/storagePaths.js). Without this proxy, requests to /api/* hit
      // Vite's SPA fallback and are answered with index.html: HTML where every
      // caller expects JSON.
      '/api': {
        target: 'http://localhost:4201',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
  },
});
