// Run by pool.int.test.ts in its own process, because Node reads NODE_EXTRA_CA_CERTS only at start-up.
// Connects as the Node adapter would from DATABASE_URL and prints the outcome as one JSON line.
import { classifyMssqlError, MssqlDatabase } from "../../src/engine/mssql.js";
import { readNodeSettings } from "../../src/node-deps.js";

const settings = readNodeSettings({ ENGINE: "mssql", DATABASE_URL: process.env.DATABASE_URL, PUBLIC_URL: "http://localhost" });
if (!settings.ok) throw new Error(`settings: ${settings.variable}`);
const database = new MssqlDatabase(settings.settings.connection);
try {
  await database.ping();
  console.log(JSON.stringify({ ok: true }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, class: classifyMssqlError(e) }));
} finally {
  await database.close();
}
