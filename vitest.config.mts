import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Route handlers run against an in-memory SQLite database that mimics D1.
// The project's vite.config.ts (Cloudflare runtime) is deliberately not used.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'cloudflare:workers': fileURLToPath(new URL('./tests/support/cloudflare-workers.ts', import.meta.url)),
    },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
