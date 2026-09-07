import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import EnvironmentPlugin from 'vite-plugin-environment';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
  },
  build: {
    sourcemap: true,
  },
});
