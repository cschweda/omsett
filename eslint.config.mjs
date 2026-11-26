import { createConfigForNuxt } from '@nuxt/eslint-config'

export default createConfigForNuxt({
  features: { tooling: true },
  dirs: { src: ['apps/web/app'], root: ['apps/web'] },
}).append(
  {
    ignores: [
      '**/.nuxt/**',
      '**/.output/**',
      '**/node_modules/**',
      'apps/web/public/**',
      'apps/web/app/generated/**',
      'playwright-report/**',
      'test-results/**',
      'brand/**',
      // The audio engine as built by libav.js (vendor/libav/build), served as it is.
      'packages/engines/vendor/**',
      'docs/**',
    ],
  },
  {
    rules: {
      // No `any` without a comment explaining why.
      '@typescript-eslint/no-explicit-any': 'error',
      // The one screen is pages/index.vue, and component names are the ones the design names.
      'vue/multi-word-component-names': 'off',
    },
  },
)
