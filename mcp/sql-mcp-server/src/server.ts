import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { MssqlDatabase } from "./engine/mssql.js";
import { nodeDeps, readPort } from "./node-deps.js";
import { op } from "./oplog.js";

/** Node runtime adapter: the container image's entry point. Settings are read once, at process start. */
const port = readPort(process.env);
if (port === undefined) {
  // With no port there is nothing to answer a 503 on, so the process ends.
  op("config_invalid", { variable: "PORT" });
  process.exitCode = 1;
} else {
  serve({ fetch: createApp(nodeDeps(process.env, (connection) => new MssqlDatabase(connection))).fetch, port });
}
