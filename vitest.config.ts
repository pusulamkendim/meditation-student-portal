import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      exclude: ['**/*.test.ts', '**/dist/**', '**/.next/**'],
      reporter: ['text', 'html'],
    },
  },
});
