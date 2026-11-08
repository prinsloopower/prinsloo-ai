import { createApp } from "../src/app.js";

/**
 * Test-only Worker: the shared app with Sign-in unconfigured, so an accepted MCP body answers 401
 * and a refused one 413. `/understated` hands the app a body longer than its `Content-Length`.
 * Never deployed; wrangler.jsonc points at src/worker.ts.
 */
const app = createApp({ ping: async () => {}, env: { SERVER_SECRET: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc" } });

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/understated") return app.fetch(request);
    const size = Number(url.searchParams.get("size"));
    const chunk = new Uint8Array(64 * 1024).fill(120);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= size) return controller.close();
        const n = Math.min(chunk.length, size - sent);
        controller.enqueue(chunk.subarray(0, n));
        sent += n;
      },
    });
    return app.fetch(new Request(new URL("/mcp", url), { method: "POST", headers: { "content-length": "100" }, body }));
  },
};
