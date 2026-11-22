import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'fixtures/**/*.test.ts', 'apps/web/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.nuxt/**', '**/.output/**', 'e2e/**'],
    testTimeout: 60_000,
  },
})
