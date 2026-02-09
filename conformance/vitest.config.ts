import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['runners/ts-runner.ts'],
    root: import.meta.dirname,
  },
});
