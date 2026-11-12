import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The MS SQL Server tests trust Docker's test CA in each test process.
    setupFiles: ["test/mssql/trust-ca.ts"],
    // Tests that start Node or tsx children run slowly while the image's bundle builds alongside them.
    testTimeout: 30_000,
  },
});
