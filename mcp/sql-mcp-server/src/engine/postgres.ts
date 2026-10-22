import pg from "pg";
import type { AccountFlags, Catalog, Database, ReasonClass } from "./database.js";

/** Connecting gives up after this long (security.md). */
const CONNECT_MS = 5000;

/** Health-check Server statement (R-004 permits it); opens and closes one connection. */
export async function pingPostgres(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    await client.end();
  }
}

/** Grants that reach every table at once (D-077), for the account the connection signs in as. */
const FLAGS_SQL = `
  SELECT r.rolsuper AS superuser,
         r.rolbypassrls AS bypass_rls,
         pg_has_role(current_user, 'pg_read_all_data', 'MEMBER') AS read_all_data,
         pg_has_role(current_user, 'pg_write_all_data', 'MEMBER') AS write_all_data
  FROM pg_roles r
  WHERE r.rolname = current_user`;

/**
 * The Allow-list's source (ADR-006): every column of every user table the account can reach, and
 * whether SELECT on it is granted, with the account flags in the same statement (D-077). A schema
 * without USAGE cannot be queried, and a table the account owns, directly or through a role it
 * belongs to, passes every privilege check, so neither is read (D-076). Partitions are read
 * through their parent.
 */
const CATALOG_SQL = `
  WITH me AS (${FLAGS_SQL})
  SELECT me.superuser, me.bypass_rls, me.read_all_data, me.write_all_data,
         t.schema_name, t.table_name, t.column_name, t.column_type, t.granted
  FROM me
  LEFT JOIN LATERAL (
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           a.attname AS column_name,
           format_type(a.atttypid, a.atttypmod) AS column_type,
           has_column_privilege(c.oid, a.attnum, 'SELECT') AS granted,
           a.attnum
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE c.relkind IN ('r', 'p')
      AND NOT c.relispartition
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg\\_toast%'
      AND n.nspname NOT LIKE 'pg\\_temp%'
      AND has_schema_privilege(n.oid, 'USAGE')
      AND NOT pg_has_role(current_user, c.relowner, 'USAGE')
  ) t ON true
  ORDER BY t.schema_name, t.table_name, t.attnum`;

interface FlagsRow {
  superuser: boolean;
  bypass_rls: boolean;
  read_all_data: boolean;
  write_all_data: boolean;
}

interface CatalogQueryRow extends FlagsRow {
  schema_name: string | null;
  table_name: string | null;
  column_name: string | null;
  column_type: string | null;
  granted: boolean | null;
}

const flagsOf = (r: FlagsRow): AccountFlags => ({
  superuser: r.superuser,
  bypassRls: r.bypass_rls,
  readAllData: r.read_all_data,
  writeAllData: r.write_all_data,
});

/** PostgreSQL behind the Engine adapter: one connection per call, closed when it ends (ADR-008). */
export class PostgresDatabase implements Database {
  constructor(private readonly connectionString: string) {}

  private async query<T>(sql: string): Promise<T[]> {
    const client = new pg.Client({ connectionString: this.connectionString, connectionTimeoutMillis: CONNECT_MS });
    await client.connect();
    try {
      return (await client.query(sql)).rows as T[];
    } finally {
      await client.end();
    }
  }

  async ping(): Promise<void> {
    await this.query("SELECT 1");
  }

  async accountFlags(): Promise<AccountFlags> {
    const [row] = await this.query<FlagsRow>(FLAGS_SQL);
    if (!row) throw Object.assign(new Error("account not found"), { code: "42501" });
    return flagsOf(row);
  }

  async catalog(): Promise<Catalog> {
    const rows = await this.query<CatalogQueryRow>(CATALOG_SQL);
    const [first] = rows;
    if (!first) throw Object.assign(new Error("account not found"), { code: "42501" });
    return {
      flags: flagsOf(first),
      rows: rows
        .filter((r) => r.schema_name !== null)
        .map((r) => ({ schema: r.schema_name!, table: r.table_name!, column: r.column_name!, type: r.column_type!, granted: r.granted === true })),
    };
  }
}

const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "EPIPE", "EAI_AGAIN"]);

/** A PostgreSQL failure's Database error class (D-080). The message is never used for anything else. */
export function classifyPostgresError(error: unknown): ReasonClass {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code.startsWith("08") || NETWORK_CODES.has(code)) return "connection";
  if (code === "57014" || /^57P0[1-5]$/.test(code)) return "timeout";
  if (code === "42501") return "permission";
  if (code.startsWith("23")) return "constraint";
  if (!code && error instanceof Error && /connect|terminated|timeout expired|socket/i.test(error.message)) return "connection";
  return "other";
}
