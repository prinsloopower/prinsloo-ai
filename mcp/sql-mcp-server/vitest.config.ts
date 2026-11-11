import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The MS SQL Server tests trust Docker's test CA in each test process.
    setupFiles: ["test/mssql/trust-ca.ts"],
  },
});
