import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    https: {
      key: readFileSync('./localhost-key.pem'),
      cert: readFileSync('./localhost.pem'),
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts']
  }
});
