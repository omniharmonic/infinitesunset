import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5201",
    viewport: { width: 1280, height: 800 },
    headless: true,
    screenshot: "only-on-failure",
    launchOptions: {
      args:
        process.platform === "darwin"
          ? ["--use-angle=metal", "--enable-unsafe-webgpu"]
          : ["--enable-webgl", "--enable-unsafe-webgpu"],
    },
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5201",
    url: "http://127.0.0.1:5201",
    reuseExistingServer: !process.env.CI,
  },
});
