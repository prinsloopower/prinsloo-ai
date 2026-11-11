import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MssqlDatabase } from "../../src/engine/mssql.js";
import { answerListing, listing } from "../../src/tools/list-tables.js";
import { SYSTEM_SCHEMA, visibleTables } from "../../src/visibility.js";
import { READER, READER_PASSWORD } from "./connection.js";
import { asAdmin, databaseAs, dropUser, freshUser } from "./fixtures.js";

// SQL Server 2022 from `npm run db:mssql:seed`. Fixtures live in the schema it_list, read as it_lister;
// the seeded sqlmcp_reader is only read, never changed.
const LISTER = "it_lister";
const opened: MssqlDatabase[] = [];
const as = (user: string, password?: string) => {
  const d = databaseAs(user, password);
  opened.push(d);
  return d;
};
const names = (tables: { schema: string; table: string }[]) => tables.map((t) => `${t.schema}.${t.table}`);

beforeAll(async () => {
  await freshUser(LISTER);
  await asAdmin(`
    DROP TABLE IF EXISTS it_list.full_grant, it_list.partial, it_list.ungranted, it_list.denied, it_list.denied_column, it_list.types, it_list.[a.b]]c], it_list.a, it_list.later;
    DROP TYPE IF EXISTS it_list.code;
    DROP SCHEMA IF EXISTS it_list;`);
  await asAdmin(`CREATE SCHEMA it_list AUTHORIZATION dbo;`);
  await asAdmin(`CREATE TYPE it_list.code FROM varchar(12);`);
  await asAdmin(`
    CREATE TABLE it_list.full_grant (id int, label nvarchar(40));
    CREATE TABLE it_list.partial (id int, name nvarchar(50), secret nvarchar(50));
    CREATE TABLE it_list.ungranted (id int);
    CREATE TABLE it_list.denied (id int);
    CREATE TABLE it_list.denied_column (id int, hidden int);
    CREATE TABLE it_list.types (
      a nvarchar(50), b varchar(30), c nchar(10), d char(5), e nvarchar(max), f varchar(max), g varbinary(max), h binary(16),
      i decimal(10, 2), j numeric(5, 0), k int, l bigint, m bit, n datetime2(3), o datetime2, p date, q uniqueidentifier,
      r float, s money, t time(0), u datetimeoffset, v it_list.code);
    CREATE TABLE it_list.[a.b]]c] (id int, label varchar(30));
    CREATE TABLE it_list.a (id int, label varchar(30));
    CREATE TABLE it_list.later (id int);
    GRANT SELECT ON it_list.full_grant TO ${LISTER};
    GRANT SELECT ON it_list.partial (id, name) TO ${LISTER};
    GRANT SELECT ON it_list.denied TO ${LISTER};
    DENY SELECT ON it_list.denied TO ${LISTER};
    GRANT SELECT ON it_list.denied_column TO ${LISTER};
    DENY SELECT ON it_list.denied_column (hidden) TO ${LISTER};
    GRANT SELECT ON it_list.types TO ${LISTER};
    GRANT SELECT ON it_list.[a.b]]c] (id) TO ${LISTER};
    GRANT SELECT ON it_list.a TO ${LISTER};`);
}, 60_000);

afterAll(async () => {
  await Promise.all(opened.map((d) => d.close()));
  await asAdmin(`
    DROP TABLE IF EXISTS it_list.full_grant, it_list.partial, it_list.ungranted, it_list.denied, it_list.denied_column, it_list.types, it_list.[a.b]]c], it_list.a, it_list.later;
    DROP TYPE IF EXISTS it_list.code;
    DROP SCHEMA IF EXISTS it_list;`);
  await dropUser(LISTER);
}, 60_000);

describe("the MS SQL Server Allow-list", () => {
  it("mssql_resolver_lists_granted_tables_and_columns", async () => {
    // The seeded reader: orders whole, and three of customers' columns.
    const seeded = visibleTables(await as(READER, READER_PASSWORD).catalog());
    expect(seeded.map((t) => ({ table: `${t.schema}.${t.table}`, columns: t.columns.map((c) => c.name), all: t.all_columns }))).toEqual([
      { table: "sqlmcp_test.customers", columns: ["id", "name", "region"], all: false },
      { table: "sqlmcp_test.orders", columns: ["id", "customer_id", "total", "notes", "placed_at", "contact"], all: true },
    ]);
    const mine = visibleTables(await as(LISTER).catalog()).filter((t) => t.schema === "it_list");
    expect(mine.find((t) => t.table === "full_grant")).toMatchObject({ all_columns: true, columns: [{ name: "id" }, { name: "label" }] });
    expect(mine.find((t) => t.table === "partial")).toMatchObject({ all_columns: false, columns: [{ name: "id" }, { name: "name" }] });
  });

  it("mssql_resolver_hides_ungranted_and_denied", async () => {
    const mine = visibleTables(await as(LISTER).catalog()).filter((t) => t.schema === "it_list");
    expect(names(mine)).not.toContain("it_list.ungranted");
    expect(names(mine)).not.toContain("it_list.denied");
    expect(mine.find((t) => t.table === "denied_column")).toMatchObject({ all_columns: false, columns: [{ name: "id" }] });
    expect(JSON.stringify(mine)).not.toContain("secret");
    expect(names(visibleTables(await as(READER, READER_PASSWORD).catalog()))).not.toContain("sqlmcp_test.staff");
  });

  it("mssql_resolver_excludes_system_tables", async () => {
    const catalog = await as(LISTER).catalog();
    for (const row of catalog.rows) expect(SYSTEM_SCHEMA.test(row.schema), row.schema).toBe(false);
    const tables = names(visibleTables(catalog));
    expect(tables.every((t) => t.startsWith("it_list.") || t.startsWith("sqlmcp_test."))).toBe(true);
  });

  it("mssql_resolver_formats_builtin_column_types", async () => {
    const types = visibleTables(await as(LISTER).catalog()).find((t) => t.schema === "it_list" && t.table === "types")!;
    expect(Object.fromEntries(types.columns.map((c) => [c.name, c.type]))).toEqual({
      a: "nvarchar(50)", b: "varchar(30)", c: "nchar(10)", d: "char(5)", e: "nvarchar(max)", f: "varchar(max)", g: "varbinary(max)", h: "binary(16)",
      i: "decimal(10,2)", j: "numeric(5,0)", k: "int", l: "bigint", m: "bit", n: "datetime2(3)", o: "datetime2(7)", p: "date", q: "uniqueidentifier",
      r: "float", s: "money", t: "time(0)", u: "datetimeoffset(7)", v: "user-defined",
    });
  });

  it("mssql_resolver_shows_user_defined_types_without_their_names", async () => {
    const result = answerListing(listing(await as(READER, READER_PASSWORD).catalog(), undefined));
    const orders = (result.result.structuredContent!.tables as { table: string; columns: { name: string; type: string }[] }[]).find((t) => t.table === "orders")!;
    expect(orders.columns.find((c) => c.name === "contact")).toEqual({ name: "contact", type: "user-defined" });
    expect(JSON.stringify(result)).not.toContain("phone");
    const lister = JSON.stringify(visibleTables(await as(LISTER).catalog()));
    expect(lister).not.toMatch(/\bcode\b/);
  });

  it("mssql_resolver_marks_every_column_readable", async () => {
    const catalog = await as(LISTER).catalog();
    expect(catalog.rows.length).toBeGreaterThan(0);
    for (const row of catalog.rows) expect(row.readable, `${row.table}.${row.column}`).toBe(true);
  });

  it("mssql_resolver_sees_grant_and_revoke_immediately", async () => {
    const database = as(LISTER);
    const listed = async () => names(visibleTables(await database.catalog()));
    expect(await listed()).not.toContain("it_list.later");
    await asAdmin(`GRANT SELECT ON it_list.later TO ${LISTER};`);
    expect(await listed()).toContain("it_list.later");
    await asAdmin(`REVOKE SELECT ON it_list.later FROM ${LISTER};`);
    expect(await listed()).not.toContain("it_list.later");
  });

  it("mssql_resolver_applies_boundary", async () => {
    const catalog = await as(LISTER).catalog();
    expect(names(visibleTables(catalog, { schemas: ["it_list"], exclude: [["it_list", "partial"]] }))).toEqual([
      "it_list.a", "it_list.a.b]c", "it_list.denied_column", "it_list.full_grant", "it_list.types",
    ]);
    expect(names(visibleTables(catalog, { schemas: ["sqlmcp_test"], exclude: [] }))).toEqual([]);
  });

  it("mssql_resolver_quotes_table_names", async () => {
    const mine = visibleTables(await as(LISTER).catalog()).filter((t) => t.schema === "it_list");
    // `a.b]c` has its own grant, on id alone; `a`, fully granted, lends it nothing.
    expect(mine.find((t) => t.table === "a.b]c")).toEqual({ schema: "it_list", table: "a.b]c", columns: [{ name: "id", type: "int" }], all_columns: false });
    expect(mine.find((t) => t.table === "a")).toMatchObject({ all_columns: true });
  });
});
