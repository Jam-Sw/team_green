// E2E config. By default the suite builds _site/ and serves it under
// /team_green/ exactly like GitHub Pages. Set E2E_BASE_URL to test a live
// deployment instead, e.g.
//   E2E_BASE_URL=https://jam-sw.github.io/team_green/ npx playwright test
const { defineConfig, devices } = require('@playwright/test');

const live = process.env.E2E_BASE_URL;
const baseURL = (live || 'http://127.0.0.1:4173/team_green/').replace(/\/?$/, '/');

module.exports = defineConfig({
  testDir: 'e2e',
  timeout: 120000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: live ? undefined : {
    command: 'node tools/serve.js _site 4173 /team_green/',
    url: baseURL,
    reuseExistingServer: !process.env.CI
  }
});
