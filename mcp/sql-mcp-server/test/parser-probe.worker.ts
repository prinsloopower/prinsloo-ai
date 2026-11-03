// @ts-expect-error Wrangler imports a .wasm file as a compiled WebAssembly.Module.
import wasm from "@libpg-query/parser/wasm/libpg-query.wasm";
import { loadPgParser } from "../src/engine/pg-parser.js";

/**
 * Test-only Worker: loads the PostgreSQL parser from the bundled WebAssembly module and
 * answers `{ tree, normalized }` for the SQL in the request body.
 * Never deployed; wrangler.jsonc points at src/worker.ts.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const sql = await request.text();
    const parser = await loadPgParser(wasm as WebAssembly.Module);
    return Response.json({ tree: parser.parse(sql), normalized: parser.normalize(sql) });
  },
};
