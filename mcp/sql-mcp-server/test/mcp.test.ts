import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev, type Unstable_DevWorker } from "wrangler";
import { handleMcp, SERVER_INFO } from "../src/mcp.js";

const BASE = "https://sql.example.com";
const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
};
const toolsList = { jsonrpc: "2.0", id: 2, method: "tools/list" };

describe("MCP handler", () => {
  it("initializes statelessly, without a session ID", async () => {
    const res = await handleMcp(
      new Request(`${BASE}/mcp`, { method: "POST", headers: HEADERS, body: JSON.stringify(initialize) }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const body = (await res.json()) as { result: { serverInfo: typeof SERVER_INFO } };
    expect(body.result.serverInfo).toEqual(SERVER_INFO);
  });

  it("answers a request that arrives with no prior initialize", async () => {
    const res = await handleMcp(
      new Request(`${BASE}/mcp`, { method: "POST", headers: HEADERS, body: JSON.stringify(toolsList) }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 2 });
  });
});

describe("MCP handler in workerd", () => {
  let worker: Unstable_DevWorker;

  beforeAll(async () => {
    worker = await unstable_dev("test/mcp-probe.worker.ts", {
      config: "test/mcp-probe.wrangler.jsonc",
      experimental: { disableExperimentalWarning: true },
    });
  }, 60_000);

  afterAll(async () => {
    await worker?.stop();
  });

  it("initializes through the SDK transport on the Workers runtime", async () => {
    const res = await worker.fetch("/mcp", { method: "POST", headers: HEADERS, body: JSON.stringify(initialize) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { serverInfo: typeof SERVER_INFO } };
    expect(body.result.serverInfo).toEqual(SERVER_INFO);
  });
});
