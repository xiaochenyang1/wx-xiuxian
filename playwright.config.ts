import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  outputDir: "test-results",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve-web-build.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 10_000,
  },
  projects: [
    {
      name: "mobile-portrait",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "desktop-portrait",
      use: {
        viewport: { width: 900, height: 1200 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
