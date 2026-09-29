import { defineConfig } from 'vitest/config';

/**
 * Tests are hermetic: every test builds its own app with an in-memory SQLite database
 * and a temporary media directory (see src/test/helpers.ts). Nothing touches ./data or ./media.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: true,
  },
});
