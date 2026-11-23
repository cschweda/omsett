import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // The fuzzer's child process runs one file, and only that file (fixtures/fuzz.test.ts starts it).
    include: process.env.OMSETT_FUZZ_FORMAT
      ? ['fixtures/_tools/fuzz-run.ts']
      : ['packages/**/*.test.ts', 'fixtures/**/*.test.ts', 'apps/web/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.nuxt/**', '**/.output/**', 'e2e/**'],
    testTimeout: 60_000,
  },
})
