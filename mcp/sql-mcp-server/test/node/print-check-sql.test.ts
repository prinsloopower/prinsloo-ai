import { execSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { accountCheckSql } from "../../src/engine/mssql.js";

describe("the account check the bundle prints", () => {
  it("check_sql_printed_matches_bundle", () => {
    execSync("npm run build:image", { stdio: "pipe" });
    const printed = spawnSync(process.execPath, ["dist/server.js", "--print-check-sql"], { encoding: "utf8", env: {} });
    // Printed with no settings, and nothing but the Azure SQL Database statement.
    expect(printed.status).toBe(0);
    expect(printed.stderr).toBe("");
    expect(printed.stdout).toBe(`${accountCheckSql(true)}\n`);
  }, 60_000);
});
