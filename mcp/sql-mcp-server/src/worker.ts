import { createApp } from "./app.js";
import type { RuntimeVariables } from "./config.js";
import { PostgresDatabase } from "./engine/postgres.js";

/** Cloudflare runtime adapter (ADR-001, ADR-002). */
interface Env {
  HYPERDRIVE: Hyperdrive;
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
        connectionSetting: "HYPERDRIVE",
        env: env as unknown as RuntimeVariables,
      });
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
