import pg from "pg";
import type { Boundary } from "../../src/config.js";
import { classifyPostgresError, PostgresDatabase } from "../../src/engine/postgres.js";
import { visibleObjects } from "../../src/query/check.js";
import { answerQuery } from "../../src/tools/query.js";
import { nodeParser } from "./node-parser.js";

// Started by `npm run db:up` (test/docker-compose.yml, ADR-010). The superuser sets up roles and
// grants; queries then run as the Database account, the way a Deployment would.
export const ADMIN = process.env.TEST_POSTGRES_URL ?? "postgres://postgres:postgres@localhost:55432/sqlmcp";

export const as = (role: string) => {
  const u = new URL(ADMIN);
  u.username = role;
  u.password = `${role}_pw`;
  return u.toString();
};

export async function admin<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: ADMIN });
  await client.connect();
  try {
    const r = await client.query(sql);
    const last = Array.isArray(r) ? r[r.length - 1] : r;
    return (last?.rows ?? []) as T[];
  } finally {
    await client.end();
  }
}

/** Drops the roles (with everything they own) and schemas, so a fixture can be rebuilt from nothing. */
export function resetSql(roles: string[], schemas: string[]): string {
  const roleDrops = roles
    .map((r) => `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${r}') THEN EXECUTE 'DROP OWNED BY ${r} CASCADE'; EXECUTE 'DROP ROLE ${r}'; END IF; END $$;`)
    .join("\n");
  return `${schemas.map((s) => `DROP SCHEMA IF EXISTS ${s} CASCADE;`).join("\n")}\n${roleDrops}`;
}

/** Runs one `query` Tool call's work, as the Database account `role`, below the MCP layer. */
export async function ask(role: string, sql: string, opts: { rowLimit?: number; boundary?: Boundary } = {}) {
  const database = new PostgresDatabase(as(role));
  const catalog = await database.catalog();
  return answerQuery(sql, {
    parser: await nodeParser(),
    database,
    visible: visibleObjects(catalog, opts.boundary),
    rowLimit: opts.rowLimit ?? 500,
    classify: classifyPostgresError,
    id: "00000000-0000-4000-8000-000000000000",
  });
}

/** The rows of an answer that ran, or what it was answered instead. */
export function rowsOf(answer: Awaited<ReturnType<typeof ask>>) {
  return answer.result.isError ? { error: answer.result.content[0]!.text } : (answer.result.structuredContent as { rows: unknown[][] }).rows;
}
