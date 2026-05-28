import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { readFileSync, existsSync } from 'node:fs';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    ...(existsSync('./localhost-key.pem')
      ? {
          https: {
            key: readFileSync('./localhost-key.pem'),
            cert: readFileSync('./localhost.pem'),
          }
        }
      : {}),
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts']
  }
});
