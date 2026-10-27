import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  retries: 0,
  reporter: 'list',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
