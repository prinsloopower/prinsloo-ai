import mssql from "mssql";
import type { AccountFlags, Catalog, Database, QueryOutcome, ReasonClass } from "./database.js";

/** The Database connect limit: the pool gives up after this, whatever `Connect Timeout` says. */
export const CONNECT_MS = 5_000;

/** The Database error classes by the server's error number, which decides before the driver's code. */
const BY_NUMBER = new Map<number, ReasonClass>([
  ...[18456, 4060, 40613, 40615, 40532, 40197, 40501, 40549, 10928, 10929].map((n) => [n, "connection"] as const),
  [1222, "timeout"],
  ...[229, 230, 262].map((n) => [n, "permission"] as const),
  ...[547, 2601, 2627, 515].map((n) => [n, "constraint"] as const),
]);
const CONNECTION_CODES = new Set(["ESOCKET", "ECONNCLOSED", "ELOGIN", "ETIMEOUT"]);

type DriverError = { number?: unknown; code?: unknown; originalError?: { number?: unknown; code?: unknown; info?: { number?: unknown } } };

/**
 * Maps a `tedious` error, as `mssql` wraps it, to the Database error classes. The server's number is on
 * the error, or on tedious's own error or its `info`. At connect time tedious keeps only the code.
 */
export function classifyMssqlError(error: unknown): ReasonClass {
  if (!error || typeof error !== "object") return "other";
  const e = error as DriverError;
  const number = [e.number, e.originalError?.number, e.originalError?.info?.number].find((n) => typeof n === "number");
  if (typeof number === "number") return BY_NUMBER.get(number) ?? "other";
  const code = e.code ?? e.originalError?.code;
  return typeof code === "string" && CONNECTION_CODES.has(code) ? "connection" : "other";
}

interface CatalogRecord {
  schema_name: string;
  table_name: string;
  column_name: string;
  type_name: string;
  granted: number | null;
}

/**
 * Every column of every user table the account can see, and whether it may SELECT it, counting
 * table-, schema- and column-level grants and denies through roles. A built-in type is shown by name,
 * with its length in characters, `max`, or its precision and scale. Any other type is `user-defined`,
 * because its name can carry a hidden object's name.
 */
const ALLOW_LIST_SQL = `
SELECT s.name AS schema_name, t.name AS table_name, c.name AS column_name,
  CASE
    WHEN ty.user_type_id IS NULL OR ty.is_user_defined = 1 THEN 'user-defined'
    WHEN ty.name IN ('nvarchar', 'nchar')
      THEN ty.name + '(' + CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length / 2 AS varchar(10)) END + ')'
    WHEN ty.name IN ('varchar', 'char', 'varbinary', 'binary')
      THEN ty.name + '(' + CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length AS varchar(10)) END + ')'
    WHEN ty.name IN ('decimal', 'numeric') THEN ty.name + '(' + CAST(c.precision AS varchar(3)) + ',' + CAST(c.scale AS varchar(3)) + ')'
    WHEN ty.name IN ('datetime2', 'time', 'datetimeoffset') THEN ty.name + '(' + CAST(c.scale AS varchar(3)) + ')'
    ELSE ty.name
  END AS type_name,
  HAS_PERMS_BY_NAME(QUOTENAME(s.name) + N'.' + QUOTENAME(t.name), N'OBJECT', N'SELECT', c.name, N'COLUMN') AS granted
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id
-- Built-in types are visible to every account; a user-defined one the account cannot see is not.
LEFT JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE t.is_ms_shipped = 0
ORDER BY s.name, t.name, c.column_id;`;

/** MS SQL Server through `mssql`: one pool per process, made from DATABASE_URL on first use. */
export class MssqlDatabase implements Database {
  private pool: Promise<mssql.ConnectionPool> | undefined;

  constructor(
    private readonly connection: mssql.config,
    private readonly makePool: (config: mssql.config) => mssql.ConnectionPool = MssqlDatabase.defaultPool,
  ) {}

  static defaultPool(config: mssql.config): mssql.ConnectionPool {
    return new mssql.ConnectionPool(config);
  }

  /**
   * The pool, connected. A pool whose first connect fails is discarded, so a Database that comes up
   * later is reached on the next call without a restart.
   */
  private connect(): Promise<mssql.ConnectionPool> {
    this.pool ??= this.makePool({
      ...this.connection,
      connectionTimeout: CONNECT_MS,
      // Statements get no Server-side time limit.
      requestTimeout: 0,
      // Always encrypted, with the certificate checked against Node's trusted CAs; no setting turns the check off.
      options: { ...this.connection.options, encrypt: true, trustServerCertificate: false },
    })
      .connect()
      .catch((e: unknown) => {
        this.pool = undefined;
        throw e;
      });
    return this.pool;
  }

  async ping(): Promise<void> {
    await (await this.connect()).request().query("SELECT 1");
  }

  async accountFlags(): Promise<AccountFlags> {
    await this.connect();
    throw new Error("The MS SQL Server account check is not built yet");
  }

  async catalog(): Promise<Catalog> {
    const result = await (await this.connect()).request().query<CatalogRecord>(ALLOW_LIST_SQL);
    return {
      flags: { superuser: false, bypassRls: false, readAllData: false, writeAllData: false, createRole: false },
      rows: result.recordset.map((r) => ({ schema: r.schema_name, table: r.table_name, column: r.column_name, type: r.type_name, granted: r.granted === 1, readable: true })),
    };
  }

  /** No query tool is registered on MS SQL Server yet. */
  async query(): Promise<QueryOutcome> {
    throw new Error("No query tool is offered on MS SQL Server");
  }

  async close(): Promise<void> {
    const pool = this.pool;
    this.pool = undefined;
    await (await pool?.catch(() => undefined))?.close();
  }
}
