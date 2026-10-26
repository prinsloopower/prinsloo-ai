// @ts-expect-error Wrangler imports a .wasm file as a compiled WebAssembly.Module.
import parserWasm from "@libpg-query/parser/wasm/libpg-query.wasm";
import { createApp } from "./app.js";
import type { RuntimeVariables } from "./config.js";
import { loadPgParser } from "./engine/pg-parser.js";
import { postgresQueryEngine } from "./engine/postgres-query-engine.js";
import { PostgresDatabase } from "./engine/postgres.js";

/** Cloudflare runtime adapter (ADR-001, ADR-002). */
interface Env {
  HYPERDRIVE: Hyperdrive;
  VERSION_METADATA?: WorkerVersionMetadata;
}

// One app per isolate, so the Identity provider's discovery and keys stay cached
// between requests (security.md); an isolate's env does not change while it lives.
let app: ReturnType<typeof createApp> | undefined;

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    if (!app) {
      const database = new PostgresDatabase(env.HYPERDRIVE.connectionString);
      app = createApp({
        ping: () => database.ping(),
        database,
        queryEngine: async () => postgresQueryEngine(await loadPgParser(parserWasm as WebAssembly.Module)),
        connectionSetting: "HYPERDRIVE",
        ...(env.VERSION_METADATA ? { serverVersion: env.VERSION_METADATA.id } : {}),
        env: env as unknown as RuntimeVariables,
      });
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
