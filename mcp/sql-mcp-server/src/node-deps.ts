import { parse as parseConnectionString } from "@tediousjs/connection-string";
import mssql from "mssql";
import type { Deps } from "./app.js";
import type { RuntimeVariables } from "./config.js";
import type { Database } from "./engine/database.js";
import { classifyMssqlError } from "./engine/mssql.js";
import { guardedFetch, type Resolve } from "./node-fetch.js";

/** The Database connection `DATABASE_URL` gives, with encryption and the certificate check forced on. */
export type MssqlConnection = mssql.config;

/** The settings only the Node adapter requires. */
export interface NodeSettings {
  connection: MssqlConnection;
  publicUrl: string;
}

export type NodeSettingsResult = { ok: true; settings: NodeSettings } | { ok: false; variable: string };

/** The `PORT` the container listens on when it is unset. */
export const DEFAULT_PORT = 8080;

function value(env: RuntimeVariables, name: string): string | undefined {
  const v = env[name];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/** `Encrypt` values that keep the connection encrypted, matched without regard to case. */
const ENCRYPTED = new Set(["true", "yes", "mandatory", "strict"]);
/** `TrustServerCertificate` values that keep the certificate checked. */
const CHECKED = new Set(["false", "no"]);

/** An ADO connection string naming a server and a database, which leaves TLS checked; never echoed. */
function parseDatabaseUrl(text: string): MssqlConnection | undefined {
  let raw: ReadonlyMap<string, unknown>;
  let parsed: MssqlConnection;
  try {
    raw = parseConnectionString(text);
    parsed = mssql.ConnectionPool.parseConnectionString.call(mssql.ConnectionPool, text) as MssqlConnection;
  } catch {
    return undefined;
  }
  if (!parsed.server || !parsed.database) return undefined;
  const setting = (key: string) => {
    const v = raw.get(key);
    return v === undefined ? undefined : String(v).trim().toLowerCase();
  };
  const encrypt = setting("encrypt");
  if (encrypt !== undefined && !ENCRYPTED.has(encrypt)) return undefined;
  const trust = setting("trustservercertificate");
  if (trust !== undefined && !CHECKED.has(trust)) return undefined;
  // On every target the connection is encrypted and the server's certificate checked.
  return { ...parsed, options: { ...parsed.options, encrypt: true, trustServerCertificate: false } };
}

/** Reads the Node adapter's own settings; the first that fails is named, never its value. */
export function readNodeSettings(env: RuntimeVariables): NodeSettingsResult {
  if (value(env, "ENGINE") !== "mssql") return { ok: false, variable: "ENGINE" };
  const databaseUrl = value(env, "DATABASE_URL");
  const connection = databaseUrl === undefined ? undefined : parseDatabaseUrl(databaseUrl);
  if (!connection) return { ok: false, variable: "DATABASE_URL" };
  const publicUrl = value(env, "PUBLIC_URL");
  if (!publicUrl) return { ok: false, variable: "PUBLIC_URL" };
  // MS SQL Server's Database account check allows the read-only tier's grants alone.
  const tier = value(env, "PERMISSION_TIER") ?? "read-only";
  if (tier !== "read-only") return { ok: false, variable: "PERMISSION_TIER" };
  return { ok: true, settings: { connection, publicUrl } };
}

/** The port to listen on, or undefined when `PORT` is not an integer from 1 to 65535. */
export function readPort(env: RuntimeVariables): number | undefined {
  const text = value(env, "PORT");
  if (text === undefined) return DEFAULT_PORT;
  const port = /^\d+$/.test(text) ? Number(text) : NaN;
  return port >= 1 && port <= 65535 ? port : undefined;
}

/**
 * The app's dependencies on Node, read from the environment once, at process start. Every fetch
 * the app makes, to the Client ID Metadata Document and the Identity provider, is guarded.
 */
export function nodeDeps(env: RuntimeVariables, makeDatabase?: (connection: MssqlConnection) => Database, opts: { resolve?: Resolve } = {}): Deps {
  const settings = readNodeSettings(env);
  const database = settings.ok && makeDatabase ? makeDatabase(settings.settings.connection) : undefined;
  return {
    ping: async () => database?.ping(),
    env,
    fetch: guardedFetch(opts),
    ...(database ? { database } : {}),
    connectionSetting: "DATABASE_URL",
    classify: classifyMssqlError,
    ...(settings.ok ? {} : { adapterConfigError: settings.variable }),
  };
}
