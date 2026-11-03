import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { callMcp, harness, signIn } from "../signin/helpers.js";
import { queryDatabase } from "../query/catalog.js";

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
};

async function serverVersion(workerVersion?: string) {
  const h = await harness({}, { realMcp: true, database: queryDatabase(), ...(workerVersion ? { serverVersion: workerVersion } : {}) });
  const token = (await signIn(h)).access_token;
  const body = (await (await callMcp(h, token, "/mcp", initialize)).json()) as { result: { serverInfo: { version: string } } };
  return body.result.serverInfo.version;
}

describe("S-004 the Server's version", () => {
  it("server_version_names_worker_version", async () => {
    const pkg = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
    expect(await serverVersion("4dc70716-52c2-411c-8fc8-1b65af40d0ff")).toBe(`${pkg}+4dc70716-52c2-411c-8fc8-1b65af40d0ff`);
    expect(await serverVersion()).toBe(pkg);
  });
});
