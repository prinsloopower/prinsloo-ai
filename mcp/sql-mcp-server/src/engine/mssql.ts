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
    await this.connect();
    throw new Error("The MS SQL Server catalog is not built yet");
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
