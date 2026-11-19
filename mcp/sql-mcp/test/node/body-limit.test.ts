import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev, type Unstable_DevWorker } from "wrangler";
import { createApp } from "../../src/app.js";
import { nodeDeps } from "../../src/node-deps.js";
import { salesDatabase } from "../listing/fake-database.js";
import { baseEnv, Clock, FakeIdentityProvider, ORIGIN, signIn, type Harness } from "../signin/helpers.js";

const MiB = 1024 * 1024;
const CHUNK = 64 * 1024;

/** A body of `size` bytes, or endless when `size` is Infinity, read in 64 KiB pieces. */
function stream(size: number): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(CHUNK).fill(120);
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= size) return controller.close();
      const n = Math.min(CHUNK, size - sent);
      controller.enqueue(chunk.subarray(0, n));
      sent += n;
    },
  });
}

/** The shared app as the Node adapter builds it, signed in, with an MCP handler that counts the body it reaches. */
async function signedInApp() {
  const clock = new Clock();
  const env = baseEnv({ ENGINE: "mssql", DATABASE_URL: "Server=a;Database=b;User Id=u;Password=p", PUBLIC_URL: ORIGIN });
  const idp = await FakeIdentityProvider.create(clock);
  const reached: number[] = [];
  const hono = createApp({
    ...nodeDeps(env, () => salesDatabase()),
    fetch: idp.fetch,
    now: clock.now,
    mcpHandler: async (req) => {
      reached.push((await req.arrayBuffer()).byteLength);
      return Response.json({ reached: true });
    },
  });
  const h: Harness = { app: { request: (i, init) => hono.request(i ?? "", init) }, idp, clock, staffSeen: [] };
  const { access_token } = await signIn(h);
  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    hono.request(`${ORIGIN}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json", ...headers },
      body,
      ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
    } as RequestInit);
  return { post, reached };
}

/** POSTs `size` bytes to a real HTTP server, with a true Content-Length or chunked; resolves to the status. */
function postOverHttp(port: number, size: number, chunked: boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path: "/mcp", method: "POST", headers: chunked ? {} : { "content-length": String(size) } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    // The server may answer and close before the whole body is written.
    req.on("error", (e) => (req.destroyed ? undefined : reject(e)));
    const piece = Buffer.alloc(CHUNK, 120);
    let sent = 0;
    const write = () => {
      while (sent < size) {
        const n = Math.min(CHUNK, size - sent);
        sent += n;
        if (!req.write(n === CHUNK ? piece : piece.subarray(0, n))) return void req.once("drain", write);
      }
      req.end();
    };
    write();
  });
}

/** A streamed body for the probe Worker, whose fetch takes Wrangler's own init type. */
const streamed = (body: ReadableStream<Uint8Array>) => ({ method: "POST", body, duplex: "half" }) as unknown as Parameters<Unstable_DevWorker["fetch"]>[1];

let server: ServerType;
let port: number;
let worker: Unstable_DevWorker;

beforeAll(async () => {
  // The Node adapter as the image runs it, Sign-in unconfigured: an accepted body answers 401.
  const app = createApp(nodeDeps({ SERVER_SECRET: baseEnv().SERVER_SECRET, ENGINE: "mssql", DATABASE_URL: "Server=a;Database=b", PUBLIC_URL: "http://127.0.0.1" }, () => salesDatabase()));
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info: AddressInfo) => {
      port = info.port;
      resolve();
    });
  });
  worker = await unstable_dev("test/body-limit-probe.worker.ts", {
    config: "test/body-limit-probe.wrangler.jsonc",
    experimental: { disableExperimentalWarning: true },
  });
}, 60_000);

afterAll(async () => {
  await worker?.stop();
  await new Promise((resolve) => server?.close(resolve));
});

describe("the MCP request body limit", () => {
  it("oversized_mcp_body_gets_413_before_parsing", async () => {
    const { post, reached } = await signedInApp();
    expect((await post("x".repeat(MiB + 1))).status).toBe(413);
    // A true Content-Length over the limit is refused at once, without reading a body that never ends.
    expect((await post(stream(Infinity), { "content-length": String(2 * MiB) })).status).toBe(413);
    expect(reached).toEqual([]);

    expect(await postOverHttp(port, MiB + 1, false)).toBe(413);
    expect((await worker.fetch("/mcp", { method: "POST", body: "x".repeat(MiB + 1) })).status).toBe(413);
  }, 60_000);

  it("oversized_chunked_body_gets_413_while_streaming", async () => {
    const { post, reached } = await signedInApp();
    expect((await post(stream(MiB + 1))).status).toBe(413);
    // Counting stops at the limit, so an endless body is refused too.
    expect((await post(stream(Infinity))).status).toBe(413);
    expect(reached).toEqual([]);

    expect(await postOverHttp(port, MiB + 1, true)).toBe(413);
    const chunked = await worker.fetch("/mcp", streamed(stream(MiB + 1)));
    expect(chunked.status).toBe(413);
  }, 60_000);

  it("understated_content_length_gets_413_while_streaming", async () => {
    const { post, reached } = await signedInApp();
    expect((await post(stream(MiB + 1), { "content-length": "100" })).status).toBe(413);
    expect(reached).toEqual([]);
    expect((await worker.fetch(`/understated?size=${MiB + 1}`)).status).toBe(413);
  }, 60_000);

  it("body_at_limit_is_accepted", async () => {
    const { post, reached } = await signedInApp();
    expect((await post("x".repeat(MiB))).status).toBe(200);
    expect((await post(stream(MiB))).status).toBe(200);
    expect((await post(stream(MiB), { "content-length": "100" })).status).toBe(200);
    // The handler reads the whole body, not only what was counted.
    expect(reached).toEqual([MiB, MiB, MiB]);

    expect(await postOverHttp(port, MiB, false)).toBe(401);
    expect(await postOverHttp(port, MiB, true)).toBe(401);
    expect((await worker.fetch("/mcp", { method: "POST", body: "x".repeat(MiB) })).status).toBe(401);
    expect((await worker.fetch("/mcp", streamed(stream(MiB)))).status).toBe(401);
    expect((await worker.fetch(`/understated?size=${MiB}`)).status).toBe(401);
  }, 60_000);
});
