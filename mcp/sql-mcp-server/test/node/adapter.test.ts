import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import type { ReasonClass } from "../../src/engine/database.js";
import { classifyMssqlError } from "../../src/engine/mssql.js";
import { classifyPostgresError } from "../../src/engine/postgres.js";
import { SERVER_INFO } from "../../src/mcp.js";
import { nodeDeps, readNodeSettings } from "../../src/node-deps.js";
import { workerDeps, type WorkerEnv } from "../../src/worker-deps.js";
import { FakeDatabase, salesDatabase } from "../listing/fake-database.js";
import { baseEnv, callMcp, captureConsole, Clock, FakeIdentityProvider, opLines, ORIGIN, signIn, type Env, type Harness } from "../signin/helpers.js";

const DATABASE_URL = "Server=tcp:sales.database.windows.net,1433;Database=sales;User Id=sqlmcp_reader;Password=p@ss;w0rd";

function nodeEnv(over: Env = {}): Env {
  return baseEnv({ ENGINE: "mssql", DATABASE_URL, PUBLIC_URL: ORIGIN, ...over });
}

/** The shared app as the Node adapter builds it, over a fake Identity provider and a fake Database. */
async function nodeHarness(over: Env = {}, database: FakeDatabase = salesDatabase()): Promise<Harness> {
  const clock = new Clock();
  const env = nodeEnv(over);
  const idp = await FakeIdentityProvider.create(clock, env.IDP_ISSUER);
  const hono = createApp({ ...nodeDeps(env, () => database), fetch: idp.fetch, now: clock.now });
  return { app: { request: (input, init) => hono.request(input ?? "", init) }, idp, clock, staffSeen: [] };
}

async function misconfigured(over: Env) {
  const h = await nodeHarness(over);
  const mcp = await callMcp(h, null);
  const health = await h.app.request(`${ORIGIN}/healthz`);
  return { status: mcp.status, text: await mcp.text(), health: (await health.json()) as Record<string, unknown> };
}

const variableOf = (env: Env) => {
  const r = readNodeSettings(env);
  return r.ok ? undefined : r.variable;
};

describe("the Node adapter's settings", () => {
  it("node_adapter_requires_engine_mssql", async () => {
    for (const engine of ["postgres", undefined, "MSSQL"]) {
      const r = await misconfigured({ ENGINE: engine });
      expect(r.status, String(engine)).toBe(503);
      expect(r.text).toBe("Deployment misconfigured: ENGINE");
      expect(r.health).toEqual({ status: "degraded", config: "invalid", variable: "ENGINE" });
    }
    expect(variableOf(nodeEnv({ ENGINE: " mssql\n" }))).toBeUndefined();
  });

  it("node_adapter_requires_database_url", async () => {
    for (const url of [undefined, "", "Database=x", "Server=a"]) {
      const r = await misconfigured({ DATABASE_URL: url });
      expect(r.status, String(url)).toBe(503);
      expect(r.text).toBe("Deployment misconfigured: DATABASE_URL");
    }
  });

  it("node_adapter_requires_public_url", async () => {
    const r = await misconfigured({ PUBLIC_URL: undefined });
    expect(r.status).toBe(503);
    expect(r.text).toBe("Deployment misconfigured: PUBLIC_URL");
    expect(r.health.variable).toBe("PUBLIC_URL");
  });

  it("node_adapter_refuses_tier_above_read_only", async () => {
    for (const tier of ["read-write", "read-write-delete", "full", "READ-ONLY"]) {
      const r = await misconfigured({ PERMISSION_TIER: tier });
      expect(r.status, tier).toBe(503);
      expect(r.text).toBe("Deployment misconfigured: PERMISSION_TIER");
    }
    expect(variableOf(nodeEnv({ PERMISSION_TIER: "read-only" }))).toBeUndefined();
    expect(variableOf(nodeEnv({ PERMISSION_TIER: undefined }))).toBeUndefined();
  });

  it("node_adapter_trims_database_url", () => {
    const r = readNodeSettings(nodeEnv({ DATABASE_URL: `  ${DATABASE_URL}\n` }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.settings.connection.server).toBe("sales.database.windows.net");
    expect(r.settings.connection.database).toBe("sales");
    expect(r.settings.connection.password).toBe("p@ss");
  });

  it("node_adapter_refuses_unparseable_database_url", () => {
    for (const url of ["not a connection string", 'Server=a;Database=b;Password="unterminated', "Database=x", "Server=;Database=b"]) {
      expect(variableOf(nodeEnv({ DATABASE_URL: url })), url).toBe("DATABASE_URL");
    }
  });

  it("node_adapter_refuses_unchecked_tls_settings", async () => {
    const base = "Server=a;Database=b;User Id=u;Password=p";
    for (const tls of ["TrustServerCertificate=true", "trustservercertificate=Yes", "Encrypt=false", "ENCRYPT=no", "Encrypt=optional", "Encrypt=banana", "Encrypt=True;TrustServerCertificate=True"]) {
      expect(variableOf(nodeEnv({ DATABASE_URL: `${base};${tls}` })), tls).toBe("DATABASE_URL");
    }
    for (const tls of ["Encrypt=True;TrustServerCertificate=False", "Encrypt=strict", "encrypt=YES", "Encrypt=mandatory", "TrustServerCertificate=no", ""]) {
      const r = readNodeSettings(nodeEnv({ DATABASE_URL: `${base};${tls}` }));
      expect(r.ok, tls).toBe(true);
      // Whatever the string says, the connection is encrypted and the certificate checked.
      if (r.ok) expect(r.settings.connection.options).toMatchObject({ encrypt: true, trustServerCertificate: false });
    }
    // A refused value is never echoed.
    const secret = "Server=a;Database=b;Password=hunter2-do-not-log;TrustServerCertificate=true";
    const lines = await captureConsole(async () => {
      const r = await misconfigured({ DATABASE_URL: secret });
      expect(JSON.stringify(r)).not.toContain("hunter2");
    });
    expect(lines.join("\n")).not.toContain("hunter2");
  });
});

describe("the app's seams", () => {
  it("adapter_config_error_takes_config_invalid_path", async () => {
    const lines = await captureConsole(async () => {
      const app = createApp({ ping: async () => {}, env: baseEnv(), adapterConfigError: "ENGINE" });
      expect((await app.request(`${ORIGIN}/healthz`)).status).toBe(503);
      const mcp = await app.request(`${ORIGIN}/mcp`, { method: "POST", body: "{}" });
      expect(mcp.status).toBe(503);
      expect(await mcp.text()).toBe("Deployment misconfigured: ENGINE");
      expect((await app.request(`${ORIGIN}/register`, { method: "POST", body: "{}" })).status).toBe(503);
    });
    expect(opLines(lines)).toEqual([expect.objectContaining({ event: "config_invalid", variable: "ENGINE" })]);
  });

  it("read_config_failure_named_before_adapter_error", async () => {
    const r = await misconfigured({ SERVER_SECRET: undefined, ENGINE: undefined });
    expect(r.text).toBe("Deployment misconfigured: SERVER_SECRET");
    expect(r.health.variable).toBe("SERVER_SECRET");
    // Among the adapter's own settings, the first that fails is named.
    expect(variableOf(nodeEnv({ ENGINE: undefined, DATABASE_URL: undefined, PUBLIC_URL: undefined, PERMISSION_TIER: "full" }))).toBe("ENGINE");
    expect(variableOf(nodeEnv({ DATABASE_URL: undefined, PUBLIC_URL: undefined, PERMISSION_TIER: "full" }))).toBe("DATABASE_URL");
    expect(variableOf(nodeEnv({ PUBLIC_URL: undefined, PERMISSION_TIER: "full" }))).toBe("PUBLIC_URL");
  });

  it("app_uses_runtime_classifier", async () => {
    // The app's source names no Engine's classifier; each runtime passes its own.
    expect(readFileSync("src/app.ts", "utf8")).not.toMatch(/engine\/(postgres|mssql)/);
    expect(workerDeps({ HYPERDRIVE: { connectionString: "postgres://u:p@localhost:1/x" } } as unknown as WorkerEnv, async () => { throw new Error(); }).classify).toBe(classifyPostgresError);
    expect(nodeDeps(nodeEnv(), () => new FakeDatabase()).classify).toBe(classifyMssqlError);

    const database = salesDatabase();
    database.failure = new Error("Login failed for host db.internal");
    const clock = new Clock();
    const idp = await FakeIdentityProvider.create(clock);
    const seen: unknown[] = [];
    const classify = (e: unknown): ReasonClass => (seen.push(e), "timeout");
    const hono = createApp({ ping: async () => {}, env: baseEnv(), fetch: idp.fetch, now: clock.now, database, classify });
    const h: Harness = { app: { request: (i, init) => hono.request(i ?? "", init) }, idp, clock, staffSeen: [] };
    const s = await signIn(h);
    const res = await callMcp(h, s.access_token, "/mcp", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_tables", arguments: { request_text: "Which tables?" } } });
    const text = JSON.stringify(await res.json());
    expect(seen).toEqual([database.failure]);
    expect(text).toContain("The database stopped the query before it finished.");
    expect(text).not.toContain("db.internal");
  });
});

describe("the Node adapter serves the shared app", () => {
  it("node_adapter_serves_healthz_and_metadata", async () => {
    const h = await nodeHarness();
    const health = await h.app.request(`${ORIGIN}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok", database: "ok" });
    const prm = (await (await h.app.request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`)).json()) as Record<string, unknown>;
    expect(prm).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN] });
    const as = (await (await h.app.request(`${ORIGIN}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>;
    expect(as).toMatchObject({ issuer: ORIGIN, registration_endpoint: `${ORIGIN}/register` });
    const reg = await h.app.request(`${ORIGIN}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }) });
    expect(reg.status).toBe(201);

    const unsafe = salesDatabase();
    unsafe.flags.superuser = true;
    const u = await nodeHarness({}, unsafe);
    expect(await (await u.app.request(`${ORIGIN}/healthz`)).json()).toEqual({ status: "degraded", database: "unsafe" });
  });

  it("node_adapter_reports_package_version_only", async () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(pkg.version).toBe("0.2.0");
    const h = await nodeHarness();
    const s = await signIn(h);
    const res = await callMcp(h, s.access_token, "/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
    const body = (await res.json()) as { result: { serverInfo: { version: string } } };
    expect(body.result.serverInfo.version).toBe(pkg.version);
    expect(SERVER_INFO.version).toBe(pkg.version);
  });

  it("node_adapter_offers_list_tables_alone", async () => {
    const h = await nodeHarness();
    const s = await signIn(h);
    const res = await callMcp(h, s.access_token);
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools.map((t) => t.name)).toEqual(["list_tables"]);
  });

  it("node_adapter_writes_audit_record_to_stdout", async () => {
    const h = await nodeHarness();
    const s = await signIn(h);
    const lines = await captureConsole(async () => {
      const res = await callMcp(h, s.access_token, "/mcp", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_tables", arguments: { request_text: "Which tables?" } } });
      expect(res.status).toBe(200);
    });
    const audits = lines.filter((l) => l.startsWith('{"type":"audit"'));
    expect(audits).toHaveLength(1);
    expect(audits[0]).not.toContain("\n");
    expect(JSON.parse(audits[0]!)).toMatchObject({ type: "audit", tool: "list_tables", deployment: ORIGIN });
  });

  it("node_adapter_exits_on_invalid_port", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/server.ts"], {
      env: { ...process.env, ...nodeEnv({ PORT: "abc" }) },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBeNull();
    const lines = r.stdout.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ type: "op", event: "config_invalid", variable: "PORT" });
  });
});
