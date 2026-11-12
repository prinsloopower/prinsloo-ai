import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { accountCheckSql, MssqlDatabase } from "./engine/mssql.js";
import { nodeDeps, readPort } from "./node-deps.js";
import { op } from "./oplog.js";

/** Node runtime adapter: the container image's entry point. Settings are read once, at process start. */
const port = readPort(process.env);
if (process.argv.includes("--print-check-sql")) {
  // The Azure SQL Database account check exactly as this build holds it, for running by hand with sqlcmd.
  process.stdout.write(`${accountCheckSql(true)}\n`);
} else if (port === undefined) {
  // With no port there is nothing to answer a 503 on, so the process ends.
  op("config_invalid", { variable: "PORT" });
  process.exitCode = 1;
} else {
  serve({ fetch: createApp(nodeDeps(process.env, (connection) => new MssqlDatabase(connection))).fetch, port });
}
