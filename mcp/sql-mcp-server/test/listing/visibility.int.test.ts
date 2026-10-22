import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/engine/postgres.js";
import { bypassesGrants, visibleTables } from "../../src/visibility.js";

// Started by `npm run db:up` (test/docker-compose.yml, ADR-010). Runs as the superuser to set up
// roles and grants, then reads the catalog as each role, the way a Deployment would.
const ADMIN = process.env.TEST_POSTGRES_URL ?? "postgres://postgres:postgres@localhost:55432/sqlmcp";
const as = (role: string) => {
  const u = new URL(ADMIN);
  u.username = role;
  u.password = `${role}_pw`;
  return u.toString();
};

const ROLES = ["it_reader", "it_team", "it_super", "it_bypass", "it_readall", "it_writeall"];

async function admin(sql: string) {
  const client = new pg.Client({ connectionString: ADMIN });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function visible(role = "it_reader") {
  const catalog = await new PostgresDatabase(as(role)).catalog();
  return visibleTables(catalog).filter((t) => t.schema.startsWith("it_"));
}

beforeAll(async () => {
  const drops = ROLES.map(
    (r) => `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${r}') THEN EXECUTE 'DROP OWNED BY ${r} CASCADE'; EXECUTE 'DROP ROLE ${r}'; END IF; END $$;`,
  ).join("\n");
  await admin(`
    DROP SCHEMA IF EXISTS it_sales CASCADE;
    DROP SCHEMA IF EXISTS it_nousage CASCADE;
    ${drops}
    CREATE ROLE it_reader LOGIN PASSWORD 'it_reader_pw';
    CREATE ROLE it_team NOLOGIN;
    CREATE ROLE it_super LOGIN SUPERUSER PASSWORD 'it_super_pw';
    CREATE ROLE it_bypass LOGIN BYPASSRLS PASSWORD 'it_bypass_pw';
    CREATE ROLE it_readall LOGIN PASSWORD 'it_readall_pw';
    CREATE ROLE it_writeall LOGIN PASSWORD 'it_writeall_pw';
    GRANT pg_read_all_data TO it_readall;
    GRANT pg_write_all_data TO it_writeall;
    CREATE SCHEMA it_sales;
    CREATE SCHEMA it_nousage;
    CREATE TABLE it_sales.orders (id integer, total numeric);
    CREATE TABLE it_sales.customers (id integer, name text, region text, email text);
    CREATE TABLE it_sales.secret (id integer);
    CREATE TABLE it_sales.mine (id integer);
    ALTER TABLE it_sales.mine OWNER TO it_reader;
    CREATE TABLE it_sales.team_table (id integer);
    ALTER TABLE it_sales.team_table OWNER TO it_team;
    GRANT it_team TO it_reader;
    CREATE TABLE it_sales.events (id integer, at date) PARTITION BY RANGE (at);
    CREATE TABLE it_sales.events_2026 PARTITION OF it_sales.events FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
    CREATE TABLE it_nousage.hidden (id integer);
    GRANT USAGE ON SCHEMA it_sales TO it_reader;
    GRANT SELECT ON it_sales.orders TO it_reader;
    GRANT SELECT (id, name, region) ON it_sales.customers TO it_reader;
    GRANT SELECT ON it_sales.events, it_sales.events_2026 TO it_reader;
    GRANT SELECT ON it_nousage.hidden TO it_reader;
  `);
}, 30_000);

afterAll(async () => {
  await admin("REVOKE SELECT ON it_sales.secret FROM it_reader;");
});

describe("S-002 Visibility resolver against PostgreSQL", () => {
  it("resolver_lists_granted_tables_and_columns", async () => {
    const tables = await visible();
    const orders = tables.find((t) => t.table === "orders");
    const customers = tables.find((t) => t.table === "customers");
    expect(orders).toEqual({ schema: "it_sales", table: "orders", columns: [{ name: "id", type: "integer" }, { name: "total", type: "numeric" }], all_columns: true });
    expect(customers).toEqual({
      schema: "it_sales",
      table: "customers",
      columns: [{ name: "id", type: "integer" }, { name: "name", type: "text" }, { name: "region", type: "text" }],
      all_columns: false,
    });
  });

  it("resolver_hides_ungranted_tables_and_columns", async () => {
    const tables = await visible();
    expect(tables.map((t) => t.table)).not.toContain("secret");
    expect(tables.find((t) => t.table === "customers")?.columns.map((c) => c.name)).not.toContain("email");
  });

  it("resolver_excludes_system_schemas_and_owned_tables", async () => {
    const catalog = await new PostgresDatabase(as("it_reader")).catalog();
    const all = visibleTables(catalog);
    expect(all.some((t) => t.schema === "pg_catalog" || t.schema === "information_schema" || t.schema.startsWith("pg_toast"))).toBe(false);
    expect(all.map((t) => t.table)).not.toContain("mine");
  });

  it("resolver_excludes_tables_owned_through_role_membership", async () => {
    expect((await visible()).map((t) => t.table)).not.toContain("team_table");
  });

  it("resolver_requires_schema_usage", async () => {
    expect((await visible()).some((t) => t.schema === "it_nousage")).toBe(false);
  });

  it("resolver_lists_partitioned_table_once", async () => {
    const names = (await visible()).map((t) => t.table);
    expect(names.filter((n) => n === "events")).toHaveLength(1);
    expect(names).not.toContain("events_2026");
  });

  it("resolver_sees_grant_and_revoke_immediately", async () => {
    expect((await visible()).map((t) => t.table)).not.toContain("secret");
    await admin("GRANT SELECT ON it_sales.secret TO it_reader;");
    expect((await visible()).map((t) => t.table)).toContain("secret");
    await admin("REVOKE SELECT ON it_sales.secret FROM it_reader;");
    expect((await visible()).map((t) => t.table)).not.toContain("secret");
  });

  it("bypass_check_refuses_superuser_bypassrls_and_read_all_data", async () => {
    expect(bypassesGrants(await new PostgresDatabase(as("it_reader")).accountFlags())).toBe(false);
    for (const role of ["it_super", "it_bypass", "it_readall", "it_writeall"]) {
      const db = new PostgresDatabase(as(role));
      expect(bypassesGrants(await db.accountFlags())).toBe(true);
      expect(bypassesGrants((await db.catalog()).flags)).toBe(true);
    }
  });
});
