import { createApp } from "./app.js";
import type { Env as Settings } from "./config.js";
import { pingPostgres } from "./engine/postgres.js";

/** Cloudflare runtime adapter (ADR-001, ADR-002). */
interface Env {
  HYPERDRIVE: Hyperdrive;
}

// One app per isolate, so the Identity provider's discovery and keys stay cached
// between requests (security.md); an isolate's env does not change while it lives.
let app: ReturnType<typeof createApp> | undefined;

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    app ??= createApp({
      ping: () => pingPostgres(env.HYPERDRIVE.connectionString),
      env: env as unknown as Settings,
    });
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
