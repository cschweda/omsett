import { defineConfig, devices } from '@playwright/test'

// Point the suite at a deployed copy with BASE_URL=https://… ; otherwise it serves the local build.
const remote = process.env.BASE_URL
const port = 4173

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: remote ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
    // Tests ask for reduced motion, so nothing moves by itself while they measure and click.
    // The one test of the comparison's opening movement turns it back on.
    contextOptions: { reducedMotion: 'reduce' },
    // The tests ask for plain names ("sample.yaml"), as a person can in Settings, so that what
    // they say about a file's name is about the conversion. The default, "-converted" after
    // the name, is tested in e2e/settings.spec.ts with nothing chosen.
    storageState: {
      cookies: [],
      origins: [{ origin: new URL(remote ?? `http://localhost:${port}`).origin, localStorage: [{ name: 'omsett:file-names', value: '{"prefix":"","suffix":""}' }] }],
    },
  },
  webServer: remote
    ? undefined
    : {
        command: 'node e2e/serve.ts',
        port,
        reuseExistingServer: !process.env.CI,
        env: { PORT: String(port) },
      },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // Firefox treats WebP as a type it can show in a tab, and the bare test profile then
        // never raises a download. Clearing the list makes a download link download.
        launchOptions: { firefoxUserPrefs: { 'browser.download.viewableInternally.enabledTypes': '' } },
      },
    },
    // WebKit follows macOS in skipping buttons on Tab, so the keyboard-order gate runs in the
    // other two; WebKit still runs every conversion and every axe check.
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
