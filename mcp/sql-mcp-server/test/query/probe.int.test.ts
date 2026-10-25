import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { classifyPostgresError, PostgresDatabase } from "../../src/engine/postgres.js";
import { visibleObjects } from "../../src/visibility.js";
import { answerQuery } from "../../src/tools/query.js";
import { nodeQueryEngine } from "./node-parser.js";
import { ADMIN, admin } from "./pg-fixture.js";

/**
 * T-014: the adversarial probe suite. Two Databases differ only in whether the hidden table
 * `ps.staff` and the ungranted column `ps.customers.email` exist. Every probe must give the Agent
 * the same answer in both, and no user-defined function or operator may run (D-083 and D-085's
 * policy functions and casts are not exercised here). A probe that later breaks the Query check is
 * added here before it is fixed.
 */
const READER = "ps_reader";
const WITH_HIDDEN = "sqlmcp_probe_hidden";
const WITHOUT = "sqlmcp_probe_missing";

const url = (database: string, role?: string) => {
  const u = new URL(ADMIN);
  u.pathname = `/${database}`;
  if (role) {
    u.username = role;
    u.password = `${role}_pw`;
  }
  return u.toString();
};

async function on<T = Record<string, unknown>>(database: string, sql: string, role?: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: url(database, role) });
  await client.connect();
  try {
    const r = await client.query(sql);
    return ((Array.isArray(r) ? r[r.length - 1] : r)?.rows ?? []) as T[];
  } finally {
    await client.end();
  }
}

const fixture = (hidden: boolean) => `
  CREATE SCHEMA ps;
  GRANT USAGE ON SCHEMA ps TO ${READER};
  CREATE TABLE ps.customers (id integer, name text, region text${hidden ? ", email text" : ""});
  INSERT INTO ps.customers (id, name, region) VALUES (1, 'Ann', 'north'), (2, 'Bob', 'south');
  GRANT SELECT (id, name, region) ON ps.customers TO ${READER};
  CREATE TABLE ps.orders (id integer, customer_id integer, total numeric);
  INSERT INTO ps.orders VALUES (1, 1, 10), (2, 2, 20);
  GRANT SELECT ON ps.orders TO ${READER};
  ${hidden ? "CREATE TABLE ps.staff (id integer, salary numeric); INSERT INTO ps.staff VALUES (1, 100);" : ""}
  CREATE DOMAIN ps.dreg AS regclass;
  CREATE TYPE ps.rrange AS RANGE (subtype = regclass);
  CREATE TYPE ps.comp_reg AS (r regclass);
  CREATE TABLE ps.items (id integer, r regclass, d ps.dreg[], rr ps.rrange, cr ps.comp_reg);
  INSERT INTO ps.items (id) VALUES (1);
  GRANT SELECT ON ps.items TO ${READER};
  CREATE FUNCTION ps.counted() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $f$ BEGIN RETURN 1; END $f$;
  CREATE FUNCTION ps.counted_eq(a integer, b integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $f$ BEGIN RETURN a = b; END $f$;
  CREATE OPERATOR ps.=== (LEFTARG = integer, RIGHTARG = integer, FUNCTION = ps.counted_eq);
  CREATE FUNCTION ps.lower(t text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $f$ BEGIN RETURN t; END $f$;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ps TO ${READER};
`;

/** Every probe named in the S-003 spec and its Critique findings, written over the `ps` fixture. */
const PROBES = [
  // Hidden and missing objects, named directly.
  "SELECT x.id FROM ps.staff x",
  "SELECT x.salary FROM ps.staff x WHERE x.id = 1",
  "SELECT c.email FROM ps.customers c",
  "SELECT c.id FROM ps.customers c WHERE c.email IS NULL",
  "SELECT ps.customers.email FROM ps.customers",
  "SELECT count(c.email) FROM ps.customers c",
  // Gate 1: names resolved before privileges.
  "SELECT email FROM ps.customers t, (SELECT 1 AS email) s",
  "SELECT s.email FROM ps.customers t NATURAL JOIN (SELECT 'z'::text AS email) s",
  "SELECT 1 AS email FROM ps.customers t GROUP BY email",
  "SELECT c.id FROM ps.customers c ORDER BY email",
  "SELECT DISTINCT ON (email) c.id FROM ps.customers c",
  "SELECT (SELECT email) FROM ps.customers c",
  "SELECT 1 FROM ps.customers c, LATERAL (SELECT c.email) x",
  "SELECT 1 FROM ps.customers c JOIN ps.orders o USING (email)",
  // Gate 1 and 2: catalog lookups through reg* casts and columns.
  "SELECT 'ps.staff'::regclass",
  "SELECT '{ps.staff}'::pg_catalog._regclass",
  "SELECT '{ps.staff}'::regclass[]",
  "SELECT to_regclass('ps.staff')",
  "SELECT has_table_privilege('ps.staff', 'select')",
  "SELECT t.r::text FROM ps.items t",
  "SELECT t.id FROM ps.items t WHERE coalesce(t.r, 'ps.staff') = t.r",
  "SELECT t.r FROM ps.items t UNION SELECT 'ps.staff'",
  "SELECT ARRAY[t.r, 'ps.staff'] FROM ps.items t",
  // Gate 2: aggregate and window ORDER BY, function notation.
  "SELECT string_agg(t.id::text, ',' ORDER BY email) AS email FROM ps.customers t, (SELECT 1 AS email) s",
  "SELECT row_number() OVER (ORDER BY email) FROM ps.customers t, (SELECT 1 AS email) s",
  "SELECT c.id FROM ps.customers c WINDOW w AS (PARTITION BY email)",
  "SELECT s.row_to_json FROM (SELECT c.id, c.region FROM ps.customers c) s",
  "SELECT row_to_json(t) FROM ps.customers t",
  "SELECT t FROM ps.customers t",
  // Gate 3: column-alias lists, join aliases, operators outside expressions.
  "SELECT 1 FROM ps.customers c(a, b, x)",
  "SELECT 1 FROM ps.customers c(a, b, x, y)",
  "SELECT 1 FROM ps.customers c(id, name, region)",
  "SELECT j.email FROM (ps.customers c JOIN (SELECT 1 AS email) s ON true) AS j",
  "SELECT 1 OPERATOR(ps.===) ANY (SELECT 1)",
  "SELECT o.id FROM ps.orders o WHERE o.id OPERATOR(ps.===) 1",
  "SELECT o.id FROM ps.orders o ORDER BY o.id USING OPERATOR(ps.===)",
  "SELECT ps.counted()",
  "SELECT ps.lower(c.name) FROM ps.customers c",
  // Amendment gate: reg* at depth.
  "SELECT t.d FROM ps.items t",
  "SELECT t.rr FROM ps.items t",
  "SELECT t.id FROM ps.items t WHERE t.rr = '[ps.staff,ps.staff]'",
  "SELECT ARRAY[t.cr, '(ps.staff)'] FROM ps.items t",
  "SELECT coalesce(t.cr, '(ps.staff)') FROM ps.items t",
  // Star expansion, catalogs, and queries that run. `*` over `ps.customers` is left out: whether it is
  // accepted follows `all_columns`, which list_tables already shows and which differs between the two (D-086).
  "SELECT * FROM ps.orders",
  "SELECT t.* FROM ps.orders t",
  "SELECT t.* FROM ps.items t",
  "SELECT r.relname FROM pg_catalog.pg_class r WHERE r.relname = 'staff'",
  "SELECT c.id, c.name FROM ps.customers c ORDER BY c.id",
  "SELECT c.region, count(*) FROM ps.orders o JOIN ps.customers c ON c.id = o.customer_id GROUP BY c.region ORDER BY c.region",
];

async function answer(database: string, sql: string) {
  const db = new PostgresDatabase(url(database, READER));
  const a = await answerQuery(sql, {
    queryEngine: await nodeQueryEngine(),
    database: db,
    visible: visibleObjects(await db.catalog()),
    rowLimit: 500,
    classify: classifyPostgresError,
    id: "00000000-0000-4000-8000-000000000000",
  });
  return { result: a.result, outcome: a.outcome };
}

/** Calls of the fixture's user-defined functions, by PostgreSQL's own statistics (track_functions = all). */
async function userFunctionCalls(database: string): Promise<number> {
  const [row] = await on<{ n: string }>(database, "SELECT pg_stat_clear_snapshot(); SELECT coalesce(sum(calls), 0)::text AS n FROM pg_stat_user_functions WHERE schemaname = 'ps'");
  return Number(row!.n);
}

async function settledCalls(database: string, atLeast: number): Promise<number> {
  for (let i = 0; i < 30; i++) {
    const n = await userFunctionCalls(database);
    if (n >= atLeast) return n;
    await new Promise((r) => setTimeout(r, 100));
  }
  return userFunctionCalls(database);
}

beforeAll(async () => {
  for (const db of [WITH_HIDDEN, WITHOUT]) await admin(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  await admin(`DROP ROLE IF EXISTS ${READER}`);
  await admin(`CREATE ROLE ${READER} LOGIN PASSWORD '${READER}_pw'; ALTER ROLE ${READER} SET track_functions = 'all'`);
  for (const [db, hidden] of [[WITH_HIDDEN, true], [WITHOUT, false]] as const) {
    await admin(`CREATE DATABASE ${db}`);
    await on(db, fixture(hidden));
  }
}, 60_000);

describe("S-003 adversarial probe suite", () => {
  it("hidden_object_probe_suite_answers_identically", async () => {
    for (const sql of PROBES) {
      expect(await answer(WITH_HIDDEN, sql), sql).toEqual(await answer(WITHOUT, sql));
    }
  }, 120_000);

  it("probe_suite_never_runs_user_functions", async () => {
    // Control: a call made directly, not through the Server, shows up in the counter.
    await on(WITH_HIDDEN, "SELECT ps.counted()", READER);
    const before = await settledCalls(WITH_HIDDEN, 1);
    expect(before).toBeGreaterThanOrEqual(1);
    for (const sql of PROBES) await answer(WITH_HIDDEN, sql);
    await new Promise((r) => setTimeout(r, 1000));
    expect(await userFunctionCalls(WITH_HIDDEN)).toBe(before);
  }, 120_000);
});
