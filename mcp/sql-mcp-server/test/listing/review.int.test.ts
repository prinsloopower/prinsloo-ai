import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/engine/postgres.js";
import { bypassesGrants, visibleTables } from "../../src/visibility.js";

// Listing edge cases against PostgreSQL. Uses its own rv_* roles and schemas so it can run
// beside visibility.int.test.ts.
const ADMIN = process.env.TEST_POSTGRES_URL ?? "postgres://postgres:postgres@localhost:55432/sqlmcp";
const as = (role: string, options?: string) => {
  const u = new URL(ADMIN);
  u.username = role;
  u.password = `${role}_pw`;
  if (options) u.searchParams.set("options", options);
  return u.toString();
};

const ROLES = ["rv_reader", "rv_supernl", "rv_bypassnl", "rv_readall_nl", "rv_member", "rv_noinherit_member", "rv_bypass_member", "rv_readall_member", "rv_creator", "rv_superlogin", "rv_owner"];

async function admin(sql: string) {
  const client = new pg.Client({ connectionString: ADMIN });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  const drops = ROLES.map(
    (r) => `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${r}') THEN EXECUTE 'DROP OWNED BY ${r} CASCADE'; EXECUTE 'DROP ROLE ${r}'; END IF; END $$;`,
  ).join("\n");
  const login = (r: string, extra = "") => `CREATE ROLE ${r} LOGIN ${extra} PASSWORD '${r}_pw';`;
  await admin(`
    DROP SCHEMA IF EXISTS rv_open CASCADE;
    DROP SCHEMA IF EXISTS rv_hidden CASCADE;
    ${drops}
    ${login("rv_reader")}
    CREATE ROLE rv_supernl NOLOGIN SUPERUSER;
    CREATE ROLE rv_bypassnl NOLOGIN BYPASSRLS;
    CREATE ROLE rv_readall_nl NOLOGIN;
    GRANT pg_read_all_data TO rv_readall_nl;
    ${login("rv_member")} GRANT rv_supernl TO rv_member;
    ${login("rv_noinherit_member")} GRANT rv_supernl TO rv_noinherit_member WITH INHERIT FALSE;
    ${login("rv_bypass_member")} GRANT rv_bypassnl TO rv_bypass_member;
    ${login("rv_readall_member")} GRANT rv_readall_nl TO rv_readall_member;
    ${login("rv_creator", "CREATEROLE")}
    ${login("rv_superlogin", "SUPERUSER")}
    GRANT rv_reader TO rv_superlogin;
    CREATE ROLE rv_owner NOLOGIN;
    GRANT rv_owner TO rv_reader WITH INHERIT FALSE;
    CREATE SCHEMA rv_hidden;
    CREATE SCHEMA rv_open;
    CREATE TYPE rv_hidden.secret_status AS ENUM ('a', 'b');
    CREATE TABLE rv_hidden.secret_tbl (id integer);
    CREATE TABLE rv_open.typed (
      id integer, amount numeric(10,2), tags text[],
      status rv_hidden.secret_status, ref rv_hidden.secret_tbl, refs rv_hidden.secret_tbl[]
    );
    CREATE TABLE rv_open.owned_noinherit (id integer);
    ALTER TABLE rv_open.owned_noinherit OWNER TO rv_owner;
    GRANT USAGE ON SCHEMA rv_open TO rv_reader;
    GRANT SELECT ON rv_open.typed, rv_open.owned_noinherit TO rv_reader;
  `);
}, 30_000);

describe("listing edge cases against PostgreSQL", () => {
  it("resolver_hides_names_inside_column_types", async () => {
    const tables = visibleTables(await new PostgresDatabase(as("rv_reader")).catalog());
    const typed = tables.find((t) => t.schema === "rv_open" && t.table === "typed");
    expect(typed?.columns).toEqual([
      { name: "id", type: "integer" },
      { name: "amount", type: "numeric(10,2)" },
      { name: "tags", type: "text[]" },
      { name: "status", type: "user-defined" },
      { name: "ref", type: "user-defined" },
      { name: "refs", type: "user-defined" },
    ]);
    expect(JSON.stringify(tables)).not.toMatch(/rv_hidden|secret/);
  });

  it("resolver_hides_tables_owned_through_noinherit_membership", async () => {
    const tables = visibleTables(await new PostgresDatabase(as("rv_reader")).catalog());
    expect(tables.map((t) => t.table)).not.toContain("owned_noinherit");
  });

  it("bypass_check_follows_role_membership_and_session_user", async () => {
    expect(bypassesGrants(await new PostgresDatabase(as("rv_reader")).accountFlags())).toBe(false);
    for (const role of ["rv_member", "rv_noinherit_member", "rv_bypass_member", "rv_readall_member", "rv_creator"]) {
      const db = new PostgresDatabase(as(role));
      expect(bypassesGrants(await db.accountFlags()), role).toBe(true);
      expect(bypassesGrants((await db.catalog()).flags), role).toBe(true);
    }
    const disguised = new PostgresDatabase(as("rv_superlogin", "-c role=rv_reader"));
    expect(bypassesGrants(await disguised.accountFlags())).toBe(true);
  });
});
