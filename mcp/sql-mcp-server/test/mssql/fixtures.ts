import type mssql from "mssql";
import { MssqlDatabase } from "../../src/engine/mssql.js";
import { readNodeSettings } from "../../src/node-deps.js";
import { adminPool, databaseUrl, DATABASE } from "./connection.js";

/** The password every fixture login gets; local container only. */
export const FIXTURE_PASSWORD = "SqlMcp-Docker-Fixture-2026!";

/** The Database the Node adapter would make for a login, from its DATABASE_URL. */
export function databaseAs(user: string, password = FIXTURE_PASSWORD): MssqlDatabase {
  const settings = readNodeSettings({ ENGINE: "mssql", DATABASE_URL: databaseUrl(user, password), PUBLIC_URL: "http://localhost" });
  if (!settings.ok) throw new Error(`settings: ${settings.variable}`);
  return new MssqlDatabase(settings.settings.connection);
}

/** Runs T-SQL as `sa` in the user database, or in master for logins. */
export async function asAdmin(sql: string, database = DATABASE): Promise<void> {
  const pool: mssql.ConnectionPool = await adminPool(database);
  try {
    await pool.request().batch(sql);
  } finally {
    await pool.close();
  }
}

/** A login and its user in `sqlmcp`, made fresh: only the login is made in master. */
export async function freshUser(name: string): Promise<void> {
  await dropUser(name);
  await asAdmin(`CREATE LOGIN [${name}] WITH PASSWORD = '${FIXTURE_PASSWORD}', CHECK_POLICY = OFF;`, "master");
  await asAdmin(`CREATE USER [${name}] FOR LOGIN [${name}];`);
}

export async function dropUser(name: string): Promise<void> {
  await asAdmin(`IF USER_ID('${name}') IS NOT NULL DROP USER [${name}];`);
  // A login with a session open cannot be dropped, so its sessions end first.
  await asAdmin(
    `DECLARE @s int; DECLARE c CURSOR LOCAL FOR SELECT session_id FROM sys.dm_exec_sessions WHERE login_name = '${name}';
     OPEN c; FETCH NEXT FROM c INTO @s;
     WHILE @@FETCH_STATUS = 0 BEGIN EXEC('KILL ' + @s); FETCH NEXT FROM c INTO @s; END;
     IF SUSER_ID('${name}') IS NOT NULL DROP LOGIN [${name}];`,
    "master",
  );
}
