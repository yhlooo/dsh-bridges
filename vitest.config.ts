import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Coverage config lives at the root: in projects mode the root `--coverage`
    // run merges unit + e2e into one report, and the gate is the combined
    // number (`pnpm test:coverage`). Floors sit below the current baseline
    // (70/78/79) so they trip on regressions, not on noise.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**'],
      reporter: ['text', 'text-summary'],
      thresholds: {
        lines: 60,
        statements: 60,
        branches: 70,
        functions: 70,
      },
    },
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
