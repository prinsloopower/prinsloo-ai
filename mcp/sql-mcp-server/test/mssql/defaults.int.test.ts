import { readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mssql from "mssql";
import { adminPool, DATABASE, READER, READER_PASSWORD } from "./connection.js";
import { asAdmin, dropUser, FIXTURE_PASSWORD, freshUser } from "./fixtures.js";
import { databaseRowCovered, OWNERSHIP_CATALOGS, serverRowCovered, type PermissionRow } from "./read-only-list.js";

// SQL Server 2022 from `npm run db:mssql:seed`. Measures what a reader made the way a Database
// administrator would make one holds by default, before the account check is built on it. The rows
// printed here go into the build record.
const FRESH = "it_fresh_reader";

/**
 * The rows `public` and the reader's other principals hold, read as the reader itself, and the views
 * to check: the same files the product owner runs with sqlcmd on Azure SQL Database.
 */
const DATABASE_ROWS = readFileSync("test/mssql/measure-database-defaults.sql", "utf8");
const SERVER_ROWS = readFileSync("test/mssql/measure-server-defaults.sql", "utf8");
const OWNERSHIP_VIEWS = readFileSync("test/mssql/ownership-views.sql", "utf8");

async function readAs(user: string, password: string, sql: string): Promise<PermissionRow[]> {
  const pool = await new mssql.ConnectionPool({
    server: "localhost", port: 51433, database: DATABASE, user, password,
    options: { encrypt: true, trustServerCertificate: false },
  }).connect();
  try {
    return (await pool.request().query<PermissionRow>(sql)).recordset;
  } finally {
    await pool.close();
  }
}

/** Prints rows for the build record: every row, except `public`'s rows on system objects, which are counted. */
function record(label: string, rows: PermissionRow[]) {
  const systemObjects = rows.filter((r) => r.principal === "public" && r.class_desc === "OBJECT_OR_COLUMN" && r.major_id < 0);
  const rest = rows.filter((r) => !systemObjects.includes(r));
  const lines = rest.map((r) => `  ${r.principal} ${r.state_desc} ${r.permission_name} on ${r.class_desc}${r.major_id ? ` ${r.major_id}` : ""}`);
  const counts = Object.entries(Object.groupBy(systemObjects, (r) => `${r.state_desc} ${r.permission_name}`)).map(([k, v]) => `  public ${k} on ${v!.length} system objects`);
  console.log(`MEASURED ${label}\n${[...lines, ...counts].join("\n")}`);
}

/**
 * The views `test/mssql/ownership-views.sql` returned on Azure SQL Database `mcp-test` in the product
 * owner's first sqlcmd session (Q-045), which the suite cannot reach.
 */
const AZURE_VIEWS = readFileSync("test/mssql/azure-ownership-views.txt", "utf8").split("\n").filter(Boolean);

beforeAll(async () => {
  // A reader as a Database administrator makes one: a login, its user, and SELECT on one table.
  await freshUser(FRESH);
  await asAdmin(`GRANT SELECT ON sqlmcp_test.orders TO ${FRESH};`);
}, 60_000);

afterAll(async () => {
  await dropUser(FRESH);
}, 60_000);

describe("MS SQL Server's defaults, measured", () => {
  it("mssql_public_defaults_are_covered_by_list", async () => {
    for (const [user, password] of [[FRESH, FIXTURE_PASSWORD], [READER, READER_PASSWORD]] as const) {
      const database = await readAs(user, password, DATABASE_ROWS);
      const server = await readAs(user, password, SERVER_ROWS);
      record(`${user}, database`, database);
      record(`${user}, server`, server);
      expect(database.filter((r) => r.principal === "public").length, "public's rows are visible to the reader").toBeGreaterThan(0);
      expect(database.filter((r) => !databaseRowCovered(r)), `${user}: database rows the list does not cover`).toEqual([]);
      expect(server.filter((r) => !serverRowCovered(r)), `${user}: server rows the list does not cover`).toEqual([]);
    }
  });

  it("mssql_ownership_list_covers_catalog_views", async () => {
    const pool = await adminPool();
    const views = (await pool.request().query<{ name: string }>(OWNERSHIP_VIEWS)).recordset.map((r) => r.name);
    await pool.close();
    console.log(`MEASURED sys views with an owner-like column on SQL Server 2022: ${views.length}\n  ${views.join(", ")}`);
    const listed = new Set([...OWNERSHIP_CATALOGS.database, ...OWNERSHIP_CATALOGS.server]);
    const notOwners = new Set(OWNERSHIP_CATALOGS.notOwners);
    expect(listed.size).toBeGreaterThan(0);
    expect(notOwners.size).toBeGreaterThan(0);
    for (const v of notOwners) expect(listed.has(v), `${v} is both listed and not an owner`).toBe(false);
    for (const [edition, found] of [["SQL Server 2022", views], ["Azure SQL Database", AZURE_VIEWS]] as const) {
      expect(found.filter((v) => !listed.has(v) && !notOwners.has(v)), `${edition}: in neither of security.md's lists`).toEqual([]);
    }
    const measured = new Set([...views, ...AZURE_VIEWS]);
    expect([...listed, ...notOwners].filter((v) => !measured.has(v)), "on security.md's lists but on neither edition").toEqual([]);
  });

  it("mssql_tests_connect_to_sqlmcp", async () => {
    const rows = await readAs(READER, READER_PASSWORD, "SELECT DB_NAME() AS principal, '' AS class_desc, '' AS permission_name, '' AS state_desc, 0 AS major_id;");
    expect(rows[0]!.principal).toBe("sqlmcp");
    const master = await adminPool("master");
    expect((await master.request().query("SELECT SCHEMA_ID('sqlmcp_test') AS id")).recordset[0].id).toBeNull();
    await master.close();
    // Only creating the user database and logins, and server-scope fixtures SQL Server allows nowhere
    // else, run in master.
    for (const file of readdirSync("test/mssql").filter((f) => f.endsWith(".ts") || f.endsWith(".sql"))) {
      const text = readFileSync(`test/mssql/${file}`, "utf8");
      for (const m of text.matchAll(/(?:asAdmin\(([\s\S]*?),\s*"master"\)|(\w+)\.request\(\)\.batch\(([^;]*;)|inMaster\((?!sql\b)([^;]*;))/g)) {
        const statement = m[1] ?? (m[2] === "master" ? m[3] : m[4]);
        if (statement) expect(statement, `${file} runs in master`).toMatch(/\b(LOGIN|DATABASE|SERVER|SECURABLES|ENDPOINT|CERTIFICATE|MASTER KEY|sp_configure)\b/);
      }
      expect(text, file).not.toMatch(/\bUSE\s+\[?master\]?/i);
    }
  });
});
