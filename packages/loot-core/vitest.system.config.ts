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
  },
  ssr: {
    resolve: { conditions: ['electron', 'module', 'node', 'development'] },
  },
  resolve: {
    conditions: ['electron', 'module', 'browser', 'development'],
  },
  plugins: [peggyLoader()],
});
