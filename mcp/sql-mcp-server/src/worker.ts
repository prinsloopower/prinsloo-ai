import { createApp } from "./app.js";
import { pingPostgres } from "./engine/postgres.js";

/** Cloudflare runtime adapter (ADR-001, ADR-002). */
interface Env {
  HYPERDRIVE: Hyperdrive;
  IDP_ISSUER?: string;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    const app = createApp({
      ping: () => pingPostgres(env.HYPERDRIVE.connectionString),
      idpIssuer: env.IDP_ISSUER || undefined,
    });
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
