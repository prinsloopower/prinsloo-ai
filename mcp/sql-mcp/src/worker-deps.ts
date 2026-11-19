import type { Deps } from "./app.js";
import type { RuntimeVariables } from "./config.js";
import type { QueryEngine } from "./engine/database.js";
import { classifyPostgresError, PostgresDatabase } from "./engine/postgres.js";

/** What the Cloudflare runtime hands the Worker. */
export interface WorkerEnv {
  HYPERDRIVE: Hyperdrive;
  /** The deployed version's id, which `initialize` reports after the package version. */
  VERSION_METADATA?: WorkerVersionMetadata;
}

/** The app's dependencies on Workers. Kept apart from worker.ts, which imports the parser's WebAssembly, so tests can build them. */
export function workerDeps(env: WorkerEnv, queryEngine: () => Promise<QueryEngine>): Deps {
  const database = new PostgresDatabase(env.HYPERDRIVE.connectionString);
  return {
    ping: () => database.ping(),
    database,
    queryEngine,
    connectionSetting: "HYPERDRIVE",
    classify: classifyPostgresError,
    ...(env.VERSION_METADATA ? { serverVersion: env.VERSION_METADATA.id } : {}),
    env: env as unknown as RuntimeVariables,
  };
}
