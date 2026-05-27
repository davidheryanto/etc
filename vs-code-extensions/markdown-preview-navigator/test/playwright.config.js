const { defineConfig } = require("@playwright/test");

// Uses the system-installed Google Chrome (channel: "chrome") so no Playwright
// browser download is needed — install with PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1.
module.exports = defineConfig({
  testDir: __dirname,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: {
    channel: "chrome",
    headless: true,
    // Deterministic device pixel ratio for the gallery screenshots.
    deviceScaleFactor: 2,
  },
});
