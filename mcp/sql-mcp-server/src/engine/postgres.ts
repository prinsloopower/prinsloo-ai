import pg from "pg";
import { visibleKey } from "../visibility.js";
import type { AccountFlags, Catalog, Database, NamedTable, QueryOutcome, ReasonClass } from "./database.js";

/** Connecting gives up after this long. */
const CONNECT_MS = 5000;

/** Health-check Server statement; opens and closes one connection. */
export async function pingPostgres(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    await client.end();
  }
}

/**
 * Routes to every table at once, judged for the role the connection logged in as
 * (session_user): it can always SET ROLE NONE back to itself, and it is a member of every role it
 * can switch to, so its memberships cover current_user's. Membership counts with or without
 * inherited rights, because a member can SET ROLE to the role.
 */
const FLAGS_SQL = `
  SELECT
    EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolsuper AND pg_has_role(session_user, r.oid, 'MEMBER')) AS superuser,
    EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolbypassrls AND pg_has_role(session_user, r.oid, 'MEMBER')) AS bypass_rls,
    pg_has_role(session_user, 'pg_read_all_data', 'MEMBER') AS read_all_data,
    pg_has_role(session_user, 'pg_write_all_data', 'MEMBER') AS write_all_data,
    EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolcreaterole AND pg_has_role(session_user, r.oid, 'MEMBER')) AS create_role`;

/**
 * The Allow-list's source: every column of every user table the account can reach, and
 * whether SELECT on it is granted, with the account flags in the same statement. A schema
 * without USAGE cannot be queried, and a table owned by any role the account is a member of passes
 * every privilege check or is a SET ROLE away, so neither is read. Partitions are read
 * through their parent. Only built-in types are named: any other type's name can carry a hidden
 * schema's or table's name (every table has a row type of its own name).
 *
 * A column is readable by Agent-written queries unless its type reaches a `reg*` type or a
 * composite, following domains, array elements, ranges and multiranges at any depth.
 */
const CATALOG_SQL = `
  WITH RECURSIVE me AS (${FLAGS_SQL}),
  cols AS (
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           a.attname AS column_name,
           CASE WHEN ty.typnamespace = 'pg_catalog'::regnamespace
                THEN format_type(a.atttypid, a.atttypmod) ELSE 'user-defined' END AS column_type,
           has_column_privilege(c.oid, a.attnum, 'SELECT') AS granted,
           a.atttypid,
           a.attnum
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    JOIN pg_type ty ON ty.oid = a.atttypid
    WHERE c.relkind IN ('r', 'p')
      AND NOT c.relispartition
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg\\_toast%'
      AND n.nspname NOT LIKE 'pg\\_temp%'
      AND has_schema_privilege(n.oid, 'USAGE')
      AND NOT pg_has_role(current_user, c.relowner, 'MEMBER')
  ),
  reach(root, oid) AS (
    SELECT DISTINCT atttypid, atttypid FROM cols
    UNION
    SELECT r.root, next.oid
    FROM reach r
    JOIN pg_type ty ON ty.oid = r.oid
    CROSS JOIN LATERAL (
      SELECT NULLIF(ty.typbasetype, 0)
      UNION ALL SELECT NULLIF(ty.typelem, 0)
      UNION ALL SELECT rg.rngsubtype FROM pg_range rg WHERE rg.rngtypid = ty.oid
      UNION ALL SELECT rg.rngtypid FROM pg_range rg WHERE rg.rngmultitypid = ty.oid
    ) next(oid)
    WHERE next.oid IS NOT NULL
  ),
  unreadable AS (
    SELECT DISTINCT r.root
    FROM reach r
    JOIN pg_type ty ON ty.oid = r.oid
    WHERE ty.typtype = 'c'
       OR (ty.typnamespace = 'pg_catalog'::regnamespace AND ty.typname IN
           ('regclass', 'regtype', 'regproc', 'regprocedure', 'regoper', 'regoperator', 'regnamespace', 'regrole', 'regconfig', 'regdictionary', 'regcollation'))
  )
  SELECT me.superuser, me.bypass_rls, me.read_all_data, me.write_all_data, me.create_role,
         t.schema_name, t.table_name, t.column_name, t.column_type, t.granted,
         t.atttypid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM unreadable u WHERE u.root = t.atttypid) AS readable
  FROM me
  LEFT JOIN cols t ON true
  ORDER BY t.schema_name, t.table_name, t.attnum`;

interface FlagsRow {
  superuser: boolean;
  bypass_rls: boolean;
  read_all_data: boolean;
  write_all_data: boolean;
  create_role: boolean;
}

interface CatalogQueryRow extends FlagsRow {
  schema_name: string | null;
  table_name: string | null;
  column_name: string | null;
  column_type: string | null;
  granted: boolean | null;
  readable: boolean | null;
}

const flagsOf = (r: FlagsRow): AccountFlags => ({
  superuser: r.superuser,
  bypassRls: r.bypass_rls,
  readAllData: r.read_all_data,
  writeAllData: r.write_all_data,
  createRole: r.create_role,
});

/** PostgreSQL behind the Engine adapter: one connection per call, closed when it ends. */
export class PostgresDatabase implements Database {
  constructor(
    private readonly connectionString: string,
    private readonly now: () => number = Date.now,
  ) {}

  private async rows<T>(sql: string): Promise<T[]> {
    const client = new pg.Client({ connectionString: this.connectionString, connectionTimeoutMillis: CONNECT_MS });
    await client.connect();
    try {
      return (await client.query(sql)).rows as T[];
    } finally {
      await client.end();
    }
  }

  async ping(): Promise<void> {
    await this.rows("SELECT 1");
  }

  async accountFlags(): Promise<AccountFlags> {
    const [row] = await this.rows<FlagsRow>(FLAGS_SQL);
    if (!row) throw Object.assign(new Error("account not found"), { code: "42501" });
    return flagsOf(row);
  }

  async catalog(): Promise<Catalog> {
    const rows = await this.rows<CatalogQueryRow>(CATALOG_SQL);
    const [first] = rows;
    if (!first) throw Object.assign(new Error("account not found"), { code: "42501" });
    return {
      flags: flagsOf(first),
      rows: rows
        .filter((r) => r.schema_name !== null)
        .map((r) => ({ schema: r.schema_name!, table: r.table_name!, column: r.column_name!, type: r.column_type!, granted: r.granted === true, readable: r.readable === true })),
    };
  }

  /**
   * The plan and execution layers of the Query check. On one connection, inside a
   * read-only transaction that is always rolled back, with `search_path` pinned to `pg_catalog`: plan
   * the query, account for every relation the plan reads, then fetch at most `rowLimit + 1` rows
   * through a cursor, so the query's text is never rewritten. Every statement goes over the extended
   * protocol, which accepts one statement only.
   */
  async query(sql: string, named: NamedTable[], rowLimit: number): Promise<QueryOutcome> {
    const client = new pg.Client({ connectionString: this.connectionString, connectionTimeoutMillis: CONNECT_MS });
    const send = <R extends unknown[] = unknown[]>(text: string, values?: unknown[], types?: pg.CustomTypesConfig) =>
      client.query<R>({ text, values, types, rowMode: "array", queryMode: "extended" } as pg.QueryArrayConfig);
    // Whether the query itself has gone to the Database, and when: from then on, any failure is the Statement's.
    let started: number | undefined;
    try {
      await client.connect();
      await send("BEGIN READ ONLY");
      await send("SET LOCAL search_path = pg_catalog");
      let plan: unknown;
      try {
        plan = (await send(`EXPLAIN (VERBOSE, FORMAT JSON) ${sql}`)).rows[0]?.[0];
      } catch (error) {
        return planFailure(error);
      }
      const accounted = new Set(
        (await send<[string, string]>(ACCOUNTED_SQL, [named.map((t) => t.schema), named.map((t) => t.table)])).rows.map(([s, t]) => visibleKey(s, t)),
      );
      if (planRelations(plan).some((r) => !accounted.has(r))) return { kind: "plan_refused", unaccounted: true };

      started = this.now();
      await send(`DECLARE sqlmcp_query NO SCROLL CURSOR FOR ${sql}`);
      const result = await send(`FETCH FORWARD ${rowLimit + 1} FROM sqlmcp_query`, undefined, VALUE_TYPES);
      const ms = this.now() - started;
      const names = await this.typeNames(send, result.fields);
      return {
        kind: "ok",
        run: {
          columns: result.fields.map((f, i) => ({ name: f.name, type: names[i] ?? "user-defined" })),
          rows: result.rows.slice(0, rowLimit),
          cutShort: result.rows.length > rowLimit,
          ms,
        },
      };
    } catch (error) {
      return started === undefined ? { kind: "error", error, sent: false, ms: 0 } : { kind: "error", error, sent: true, ms: this.now() - started };
    } finally {
      // Best effort: the transaction is read-only and ends with the connection anyway, and a failure
      // here must not replace the outcome already decided.
      await client.query("ROLLBACK").catch(() => {});
      await client.end().catch(() => {});
    }
  }

  /** Result column types, named as `list_tables` names them, by one Server statement. */
  protected async typeNames(send: (text: string, values?: unknown[]) => Promise<pg.QueryArrayResult>, fields: pg.FieldDef[]): Promise<string[]> {
    if (!fields.length) return [];
    const result = await send(TYPE_NAMES_SQL, [fields.map((f) => f.dataTypeID), fields.map((f) => f.dataTypeModifier)]);
    return result.rows.map(([n]) => n as string);
  }
}

/**
 * How a failure to plan an Agent-written query ends: a lost connection is a Database error,
 * classed by its Database error class; anything PostgreSQL itself raised is a plan Refusal.
 */
export function planFailure(error: unknown): QueryOutcome {
  if (classifyPostgresError(error) === "connection") return { kind: "error", error, sent: false, ms: 0 };
  const code = errorCode(error);
  return { kind: "plan_refused", unaccounted: false, ...(code ? { code } : {}) };
}

/**
 * The relations a query's plan may read, given the tables it names: those tables, their partitions
 * and inheritance descendants, the tables their row-level security policies read, and the base
 * tables of views those policies read, followed to the end of the chain. PostgreSQL reads all of
 * them under the named table's grant.
 */
const ACCOUNTED_SQL = `
  WITH RECURSIVE named AS (
    SELECT c.oid
    FROM unnest($1::text[], $2::text[]) AS u(schema_name, table_name)
    JOIN pg_namespace n ON n.nspname = u.schema_name
    JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = u.table_name
  ),
  reach(oid) AS (
    SELECT oid FROM named
    UNION
    SELECT x.oid
    FROM reach r
    CROSS JOIN LATERAL (
      SELECT i.inhrelid FROM pg_inherits i WHERE i.inhparent = r.oid
      UNION ALL
      SELECT d.refobjid FROM pg_policy p
      JOIN pg_depend d ON d.classid = 'pg_policy'::regclass AND d.objid = p.oid AND d.refclassid = 'pg_class'::regclass
      WHERE p.polrelid = r.oid
      UNION ALL
      SELECT d.refobjid FROM pg_rewrite w
      JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = w.oid AND d.refclassid = 'pg_class'::regclass
      WHERE w.ev_class = r.oid AND d.refobjid <> r.oid
    ) x(oid)
  )
  SELECT n.nspname, c.relname FROM reach r JOIN pg_class c ON c.oid = r.oid JOIN pg_namespace n ON n.oid = c.relnamespace`;

/** Result column types, named as `list_tables` names them: built-in by `format_type`, any other `user-defined`. */
const TYPE_NAMES_SQL = `
  SELECT CASE WHEN t.typnamespace = 'pg_catalog'::regnamespace THEN format_type(t.oid, NULLIF(u.mod, -1)) ELSE 'user-defined' END
  FROM unnest($1::oid[], $2::int4[]) WITH ORDINALITY AS u(type_oid, mod, ord)
  LEFT JOIN pg_type t ON t.oid = u.type_oid
  ORDER BY u.ord`;

/** The value forms results use: booleans, 16- and 32-bit integers and floats as JSON, everything else as PostgreSQL prints it. */
const VALUE_TYPES: pg.CustomTypesConfig = {
  getTypeParser: ((oid: number) => {
    if (oid === 16) return (v: string) => v === "t";
    if (oid === 21 || oid === 23) return (v: string) => Number(v);
    if (oid === 700 || oid === 701) return (v: string) => (/^-?(NaN|Infinity)$/.test(v) ? v : Number(v));
    return (v: string) => v;
  }) as pg.CustomTypesConfig["getTypeParser"],
};

/** Every `Schema`/`Relation Name` pair an `EXPLAIN (VERBOSE, FORMAT JSON)` plan reads. */
function planRelations(plan: unknown): string[] {
  const found: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const n = node as Record<string, unknown>;
    if (typeof n["Relation Name"] === "string" && typeof n.Schema === "string") found.push(visibleKey(n.Schema, n["Relation Name"]));
    visit(n.Plan);
    visit(n.Plans);
  };
  visit(plan);
  return found;
}

const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "EPIPE", "EAI_AGAIN"]);

/** A driver or Node error's code: a SQLSTATE, or a socket code such as `EPIPE`. */
const errorCode = (error: unknown) => (typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "");

/** A PostgreSQL failure's Database error class. The message is never used for anything else. */
export function classifyPostgresError(error: unknown): ReasonClass {
  const code = errorCode(error);
  if (code.startsWith("08") || NETWORK_CODES.has(code)) return "connection";
  if (code === "57014" || /^57P0[1-5]$/.test(code)) return "timeout";
  if (code === "42501") return "permission";
  if (code.startsWith("23")) return "constraint";
  if (!code && error instanceof Error && /connect|terminated|timeout expired|socket/i.test(error.message)) return "connection";
  return "other";
}
