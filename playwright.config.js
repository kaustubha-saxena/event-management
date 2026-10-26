import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "campusflow.spec.js",
  workers: 1,
  use: {
    baseURL: "http://localhost:3199",
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.CHROMIUM_PATH
      ? {
          executablePath: process.env.CHROMIUM_PATH,
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        }
      : {},
  },
  reporter: "list",
  webServer: {
    command: "node server/preview.js",
    url: "http://localhost:3199/",
    reuseExistingServer: false,
    env: { PORT: "3199", APP_URL: "http://localhost:3199" },
  },
});
