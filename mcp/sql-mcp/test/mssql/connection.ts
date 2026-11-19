import { existsSync, readFileSync } from "node:fs";
import mssql from "mssql";

/** SQL Server 2022 from test/docker-compose.yml. These passwords are for the local container only. */
export const HOST = "localhost";
export const PORT = 51433;
export const DATABASE = "sqlmcp";
export const SA_PASSWORD = "SqlMcp-Docker-Sa-2026!";
export const READER = "sqlmcp_reader";
export const READER_PASSWORD = "SqlMcp-Docker-Reader-2026!";
export const CA = "test/mssql/certs/ca.crt";

/** A DATABASE_URL for a login, in the ADO form an Operator writes. Never `master`. */
export function databaseUrl(user: string, password: string, extra = ""): string {
  return `Server=${HOST},${PORT};Database=${DATABASE};User Id=${user};Password=${password};Encrypt=true${extra}`;
}

/**
 * A pool for setting up fixtures as `sa`, trusting the test CA directly; the code under test trusts it
 * only through NODE_EXTRA_CA_CERTS, as the image does.
 */
export async function adminPool(database = DATABASE): Promise<mssql.ConnectionPool> {
  if (!existsSync(CA)) throw new Error(`${CA} is missing: run npm run db:mssql:certs`);
  return new mssql.ConnectionPool({
    server: HOST,
    port: PORT,
    database,
    user: "sa",
    password: SA_PASSWORD,
    options: { encrypt: true, trustServerCertificate: false, cryptoCredentialsDetails: { ca: readFileSync(CA) } },
  }).connect();
}

/** Runs a script of batches separated by `GO` lines. */
export async function runBatches(pool: mssql.ConnectionPool, script: string): Promise<void> {
  for (const batch of script.split(/^\s*GO\s*$/im)) {
    if (batch.trim()) await pool.request().batch(batch);
  }
}
