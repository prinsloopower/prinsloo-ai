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

/** The catalogs of owned securables the check reads in the database, and where the server level can be read. */
export const OWNED_IN_DATABASE = [
  "schemas", "objects", "types", "xml_schema_collections", "assemblies", "certificates", "asymmetric_keys", "symmetric_keys",
  "fulltext_catalogs", "fulltext_stoplists", "registered_search_property_lists", "service_contracts", "service_message_types",
  "services", "routes", "remote_service_bindings", "event_notifications", "database_scoped_credentials", "external_languages",
  "external_libraries", "external_models", "external_streams", "external_streaming_jobs", "database_principals",
];
export const OWNED_ON_SERVER = ["server_principals", "endpoints", "server_audits", "server_event_notifications"];

/** The two catalogs only one supported edition has, skipped where the instance lacks them. Any other missing one fails. */
const EDITION_SPECIFIC = new Set(["external_models", "external_languages"]);

/** A principal's owner is `owning_principal_id`; every other catalog's is `principal_id`. */
function ownedBy(view: string, principals: string): string {
  const column = view.endsWith("_principals") ? "owning_principal_id" : "principal_id";
  const test = `IF EXISTS (SELECT 1 FROM sys.${view} WHERE ${column} IN (SELECT principal_id FROM ${principals})) SET @unlisted = 1;`;
  return EDITION_SPECIFIC.has(view) ? `IF OBJECT_ID(N'sys.${view}') IS NOT NULL ${test}` : test;
}

/**
 * The MS SQL Server Database account check: `unlisted` is 1 when the account holds anything outside
 * the read-only tier's closed list. The account's principals are its session tokens, so roles at any depth
 * and groups count. On Azure SQL Database (`azure`), which cannot read the server level, the account
 * must instead be a contained SQL-authenticated user. DENY rows only narrow, so they never refuse.
 */
export function accountCheckSql(azure: boolean): string {
  const database = [
    "DECLARE @unlisted bit = 0;",
    "DECLARE @db TABLE (principal_id int);",
    "INSERT INTO @db SELECT principal_id FROM sys.user_token;",
    // It is not dbo, and holds no fixed database role but public.
    "IF EXISTS (SELECT 1 FROM @db WHERE principal_id = 1) SET @unlisted = 1;",
    "IF EXISTS (SELECT 1 FROM @db p JOIN sys.database_principals r ON r.principal_id = p.principal_id WHERE r.is_fixed_role = 1) SET @unlisted = 1;",
    ...OWNED_IN_DATABASE.map((v) => ownedBy(v, "@db")),
    `IF EXISTS (SELECT 1 FROM sys.database_permissions g
  WHERE g.grantee_principal_id IN (SELECT principal_id FROM @db) AND g.state IN ('G', 'W')
    AND NOT ((g.class = 0 AND g.permission_name IN (N'CONNECT', N'SHOWPLAN', N'VIEW ANY COLUMN ENCRYPTION KEY DEFINITION', N'VIEW ANY COLUMN MASTER KEY DEFINITION'))
      OR (g.class IN (1, 3) AND g.permission_name = N'SELECT')
      OR (g.grantee_principal_id = 0 AND g.class = 1 AND g.major_id < 0)))
  SET @unlisted = 1;`,
  ];
  const contained =
    "IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE principal_id = DATABASE_PRINCIPAL_ID() AND type = 'S' AND authentication_type = 2) SET @unlisted = 1;";
  const server = [
    "DECLARE @server TABLE (principal_id int);",
    "INSERT INTO @server SELECT principal_id FROM sys.login_token;",
    // No server role but public (principal 2), fixed or user-defined.
    "IF EXISTS (SELECT 1 FROM sys.login_token WHERE type = 'SERVER ROLE' AND principal_id <> 2) SET @unlisted = 1;",
    "IF EXISTS (SELECT 1 FROM @server p JOIN sys.server_principals r ON r.principal_id = p.principal_id WHERE r.type = 'R' AND r.principal_id <> 2) SET @unlisted = 1;",
    ...OWNED_ON_SERVER.map((v) => ownedBy(v, "@server")),
    `IF EXISTS (SELECT 1 FROM sys.server_permissions g
  WHERE g.grantee_principal_id IN (SELECT principal_id FROM @server) AND g.state IN ('G', 'W')
    AND NOT ((g.class = 100 AND g.permission_name IN (N'CONNECT SQL', N'VIEW ANY DATABASE'))
      OR (g.class = 105 AND g.permission_name = N'CONNECT')))
  SET @unlisted = 1;`,
  ];
  return [...database, ...(azure ? [contained] : server), "SELECT @unlisted AS unlisted;"].join("\n");
}

const flagsOf = (unlisted: boolean): AccountFlags => ({ superuser: false, bypassRls: false, readAllData: false, writeAllData: false, createRole: false, unlisted });

/** MS SQL Server through `mssql`: one pool per process, made from DATABASE_URL on first use. */
export class MssqlDatabase implements Database {
  private pool: Promise<mssql.ConnectionPool> | undefined;
  private check: Promise<string> | undefined;

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

  /** The account check for this server's edition, read once: Azure SQL Database is EngineEdition 5. */
  private checkSql(pool: mssql.ConnectionPool): Promise<string> {
    this.check ??= pool
      .request()
      .query<{ edition: number | null }>("SELECT CAST(SERVERPROPERTY('EngineEdition') AS int) AS edition")
      .then((r) => accountCheckSql(r.recordset[0]?.edition === 5))
      .catch((e: unknown) => {
        this.check = undefined;
        throw e;
      });
    return this.check;
  }

  async accountFlags(): Promise<AccountFlags> {
    const pool = await this.connect();
    const result = await pool.request().query<{ unlisted: boolean }>(await this.checkSql(pool));
    return flagsOf(result.recordset[0]?.unlisted !== false);
  }

  /** The account check and the Allow-list in one catalog Server statement. */
  async catalog(): Promise<Catalog> {
    const pool = await this.connect();
    const result = await pool.request().query(`${await this.checkSql(pool)}\n${ALLOW_LIST_SQL}`);
    const [check, rows] = result.recordsets as unknown as [{ unlisted: boolean }[], CatalogRecord[]];
    return {
      flags: flagsOf(check[0]?.unlisted !== false),
      rows: rows.map((r) => ({ schema: r.schema_name, table: r.table_name, column: r.column_name, type: r.type_name, granted: r.granted === 1, readable: true })),
    };
  }

  /** No query tool is registered on MS SQL Server yet. */
  async query(): Promise<QueryOutcome> {
    throw new Error("No query tool is offered on MS SQL Server");
  }

  async close(): Promise<void> {
    const pool = this.pool;
    this.pool = undefined;
    this.check = undefined;
    await (await pool?.catch(() => undefined))?.close();
  }
}
