import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          testTimeout: 15000,
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['e2e/**/*.test.ts'],
          testTimeout: 60000,
          hookTimeout: 30000,
          // Every test boots a real cordis composition and spawns real hook
          // processes; run files serially to keep timing deterministic.
          fileParallelism: false,
        },
      },
    ],
  },
})
