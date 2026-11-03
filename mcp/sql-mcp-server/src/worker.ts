// @ts-expect-error Wrangler imports a .wasm file as a compiled WebAssembly.Module.
import parserWasm from "@libpg-query/parser/wasm/libpg-query.wasm";
import { createApp } from "./app.js";
import { loadPgParser } from "./engine/pg-parser.js";
import { postgresQueryEngine } from "./engine/postgres-query-engine.js";
import { type WorkerEnv, workerDeps } from "./worker-deps.js";

// One app per isolate, so the Identity provider's discovery and keys stay cached
// between requests; an isolate's env does not change while it lives.
let app: ReturnType<typeof createApp> | undefined;

/** Cloudflare runtime adapter. */
export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Response | Promise<Response> {
    app ??= createApp(workerDeps(env, async () => postgresQueryEngine(await loadPgParser(parserWasm as WebAssembly.Module))));
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<WorkerEnv>;
