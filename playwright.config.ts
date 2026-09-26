import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/acceptance",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // Run sequentially for simplicity in DB state
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
  },
});
