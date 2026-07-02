import peggyLoader from 'vite-plugin-peggy-loader';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/server/__integration__/**/*.integration.test.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['./src/mocks/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 20000,
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
