import peggyLoader from 'vite-plugin-peggy-loader';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/server/__system__/**/*.system.test.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['./src/mocks/setup.ts'],
    testTimeout: 300000,
    hookTimeout: 120000,
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage/system',
      include: [
        'src/server/db/**/*.ts',
        'src/server/budget/**/*.ts',
        'src/platform/server/sqlite/**/*.ts',
      ],
      thresholds: {
        statements: 30,
        branches: 25,
        functions: 25,
        lines: 30,
      },
    },
  },
  ssr: {
    resolve: { conditions: ['electron', 'module', 'node', 'development'] },
  },
  resolve: {
    conditions: ['electron', 'module', 'browser', 'development'],
  },
  plugins: [peggyLoader()],
});
