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
async function printed(worker = TRIAL.worker, later = false) {
  const w = world({ ...TRIAL, worker, role: ROLE });
  // The fake's random bytes repeat from world to world; a later run must draw different ones.
  if (later) w.deps.randomBytes(7);
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
  await admin(resetSql([ROLE, "s005_owner"], [SCHEMA]));
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
    const first = await printed();
    await run(first.sql);
    // Printed again for the same Deployment, as a rerun or a rotation does, it gives the role setup made a new password.
    const again = await printed(TRIAL.worker, true);
    expect(again.password).not.toBe(first.password);
    await run(again.sql);
    expect(await connects(again.password)).toBe(true);
    expect(await connects(first.password)).toBe(false);
    // For another Deployment, the same role name is refused and the role is untouched.
    const other = await printed("another-deployment");
    await expect(run(other.sql)).rejects.toThrow(/already exists and was not made by setup for this Deployment, so nothing was changed/);
    expect(await connects(again.password)).toBe(true);
    // So is a role made any other way, which another Deployment may be using.
    await admin(`DROP ROLE ${ROLE}; CREATE ROLE ${ROLE} LOGIN PASSWORD 'theirs';`);
    await expect(run(first.sql)).rejects.toThrow(/already exists and was not made by setup/);
    expect(await connects("theirs")).toBe(true);
    expect(await connects(first.password)).toBe(false);
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

  it("database_account_sql_lists_what_server_sees", async () => {
    const { sql, password } = await printed();
    await run(sql);
    // Grants of every kind the Server's read distinguishes: to PUBLIC, to the role, by column, a
    // partitioned table, and a table owned by a role the account belongs to.
    await admin(`CREATE ROLE s005_owner; GRANT s005_owner TO ${ROLE};
                 CREATE SCHEMA ${SCHEMA}; GRANT USAGE ON SCHEMA ${SCHEMA} TO PUBLIC;
                 CREATE TABLE ${SCHEMA}.shared (id int, note text); GRANT SELECT ON ${SCHEMA}.shared TO PUBLIC;
                 CREATE TABLE ${SCHEMA}.orders (id int, total numeric, secret text); GRANT SELECT (id, total) ON ${SCHEMA}.orders TO ${ROLE};
                 CREATE TABLE ${SCHEMA}.events (id int, at date) PARTITION BY RANGE (at);
                 CREATE TABLE ${SCHEMA}.events_2026 PARTITION OF ${SCHEMA}.events FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
                 GRANT SELECT ON ${SCHEMA}.events, ${SCHEMA}.events_2026 TO ${ROLE};
                 CREATE TABLE ${SCHEMA}.owned (id int); ALTER TABLE ${SCHEMA}.owned OWNER TO s005_owner;`);
    const listing = (await run(sql)).map((r) => `${r.schema_name}.${r.table_name}.${r.column_name}`);
    const catalog = await new PostgresDatabase(asRole(password)).catalog();
    const server = catalog.rows.filter((r) => r.granted).map((r) => `${r.schema}.${r.table}.${r.column}`).sort();
    expect(listing).toEqual(server);
    expect(listing).toContain(`${SCHEMA}.orders.total`);
    expect(listing).not.toContain(`${SCHEMA}.orders.secret`);
    expect(listing.some((c) => c.includes(".owned."))).toBe(false);
  });
});
