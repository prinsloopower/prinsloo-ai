import pg from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { setup } from "../../deploy/cloudflare/lib/setup.js";
import { PostgresDatabase } from "../../src/engine/postgres.js";
import { bypassesGrants } from "../../src/visibility.js";
import { ADMIN, admin, resetSql } from "../query/pg-fixture.js";
import { TRIAL, world } from "./world.js";

const ROLE = "sqlmcp_s005";
const SCHEMA = "s005_public";

/** The SQL the setup command prints for the Operator, and the password it gave Hyperdrive. */
async function printed() {
  const w = world({ ...TRIAL, role: ROLE });
  await setup("setup", w.deps);
  const sql = w.paused[0]!.slice(w.paused[0]!.indexOf("-- The Database account"));
  const password = JSON.parse(w.requests.find((r) => r.method === "POST")!.body!).origin.password as string;
  return { sql, password };
}

const asRole = (password: string) => {
  const u = new URL(ADMIN);
  u.username = ROLE;
  u.password = password;
  return u.toString();
};

async function connects(password: string) {
  const c = new pg.Client({ connectionString: asRole(password) });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
}

/** Runs the printed SQL as postgres, as the Operator does in the Supabase SQL editor. */
const run = (sql: string) => admin<{ schema_name: string; table_name: string; column_name: string }>(sql);

beforeEach(async () => {
  await admin(resetSql([ROLE], [SCHEMA]));
});

describe("S-005 the Database account SQL", () => {
  it("database_account_sql_creates_safe_role", async () => {
    const { sql, password } = await printed();
    const listing = await run(sql);
    expect(listing).toEqual([]);
    expect(await connects(password)).toBe(true);
    expect(await connects(`${password}x`)).toBe(false);
    // The role passes the Server's own account check (D-077), and holds nothing beyond LOGIN.
    expect(bypassesGrants(await new PostgresDatabase(asRole(password)).accountFlags())).toBe(false);
    const [r] = await admin<Record<string, boolean>>(
      `SELECT rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls,
              EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid) AS member
       FROM pg_roles r WHERE rolname = '${ROLE}'`,
    );
    expect(r).toMatchObject({ rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolcanlogin: true, rolreplication: false, rolbypassrls: false, member: false });
  });

  it("database_account_sql_refuses_existing_role", async () => {
    const { sql, password } = await printed();
    await run(sql);
    // A second run of the same SQL changes nothing.
    await expect(run(sql)).rejects.toThrow(/already exists, so nothing was changed/);
    expect(await connects(password)).toBe(true);
    // Nor does a run naming a role another Deployment already uses.
    await admin(`DROP ROLE ${ROLE}; CREATE ROLE ${ROLE} LOGIN PASSWORD 'theirs';`);
    await expect(run(sql)).rejects.toThrow(/already exists/);
    expect(await connects("theirs")).toBe(true);
    expect(await connects(password)).toBe(false);
  });

  it("database_account_sql_lists_public_grants", async () => {
    await admin(`CREATE SCHEMA ${SCHEMA}; CREATE TABLE ${SCHEMA}.shared (id int, note text); CREATE TABLE ${SCHEMA}.private (id int);
                 GRANT USAGE ON SCHEMA ${SCHEMA} TO PUBLIC; GRANT SELECT ON ${SCHEMA}.shared TO PUBLIC;`);
    const { sql } = await printed();
    const listing = await run(sql);
    expect(listing).toEqual([
      { schema_name: SCHEMA, table_name: "shared", column_name: "id" },
      { schema_name: SCHEMA, table_name: "shared", column_name: "note" },
    ]);
  });
});
