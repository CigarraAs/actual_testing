import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/server/integration-tests/**/*.test.ts'],
    exclude: ['node_modules'],
    setupFiles: [],
    onConsoleLog(log: string, type: 'stdout' | 'stderr'): boolean | void {
      return type === 'stderr';
    },
    maxWorkers: 1,
  },
  ssr: {
    resolve: { conditions: ['electron', 'module', 'node', 'development'] },
  },
  resolve: {
    conditions: ['electron', 'module', 'browser', 'development'],
  },
});
