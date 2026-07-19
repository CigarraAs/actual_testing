import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['src/__integration__/sync-large.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});