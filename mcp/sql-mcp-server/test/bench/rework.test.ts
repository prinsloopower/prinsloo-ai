import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { REFUSED_QUERY, StopInvocation, runBenchmark, type Server, type ServerResult } from "../../bench/src/harness.js";
import { judge } from "../../bench/src/judge.js";
import type { Question } from "../../bench/src/reference.js";
import { buildReport, credentialsInUse } from "../../bench/src/report.js";
import { renewingServer } from "../../bench/src/server.js";
import { signIn } from "../../bench/src/signin.js";
import { REQUEST_TEXT_REFUSAL } from "../../src/tools/answer.js";
import { LIST_TABLES } from "../../src/tools/list-tables.js";
import { QUERY, queryRefusals } from "../../src/tools/query.js";
import { workerDeps } from "../../src/worker-deps.js";
import { queryDatabase } from "../query/catalog.js";
import { ORIGIN, callMcp, harness, signIn as signInToApp } from "../signin/helpers.js";

// S-004 review rework (D-096).

const question: Question = { id: "B-01", text: "How many?", type: "integer", expected: { type: "integer", value: 12 }, sql: "SELECT 12" };

describe("S-004 rework: the Judge follows the spec's text rules", () => {
  it("judge_compares_text_as_spec_says", () => {
    const olive = { type: "text", value: "Olive Oil 5L" } as const;
    expect(judge("ANSWER: OliveOil5L", olive).correct).toBe(false);
    expect(judge("ANSWER:  olive   oil 5l. ", olive).correct).toBe(true);
    expect(judge("ANSWER: **Olive Oil 5L**", olive).correct).toBe(true);
    expect(judge("ANSWER: Olive_Oil 5L", olive).correct).toBe(false);
    expect(judge("ANSWER: Olive*Oil 5L", olive).correct).toBe(false);
    const list = { type: "list" as const, value: ["Feta Tub", "Seed Crackers"] };
    expect(judge("*ANSWER: `Seed Crackers, Feta Tub`*", list).correct).toBe(true);
    expect(judge("ANSWER: Feta Tub, SeedCrackers", list).correct).toBe(false);
    const map = { type: "map", value: { "Elm Street Deli": 3 }, values: "integer" } as const;
    expect(judge("ANSWER: elm street deli=3", map).correct).toBe(true);
    expect(judge("ANSWER: ElmStreetDeli=3", map).correct).toBe(false);
  });
});

describe("S-004 rework: the harness uses the Server's own names", () => {
  it("harness_counts_server_tool_names_and_refusals", async () => {
    // Every query Refusal the Server can send starts with the prefix the harness counts; an input refusal does not.
    for (const { sentence } of Object.values(queryRefusals("PostgreSQL"))) expect(sentence.startsWith(REFUSED_QUERY)).toBe(true);
    expect(REQUEST_TEXT_REFUSAL.startsWith(REFUSED_QUERY)).toBe(false);

    const sentence = queryRefusals("PostgreSQL").not_select.sentence;
    let n = 0;
    const model = async () =>
      ({
        content: [n++ === 0 ? { type: "tool_use", id: "t0", name: LIST_TABLES, input: {} } : { type: "tool_use", id: `t${n}`, name: QUERY, input: { sql: "x" } }],
        stop_reason: "tool_use",
        usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }) as unknown as Anthropic.Messages.Message;
    const server: Server = {
      name: "s",
      version: "v",
      tools: [],
      call: async (name): Promise<ServerResult> =>
        name === QUERY ? { content: [{ type: "text", text: `${sentence} (reference 0000)` }], isError: true } : { content: [{ type: "text", text: "tables" }] },
    };
    const { runs } = await runBenchmark({ questions: [question], runs: 1, model, server });
    expect(runs[0]![0]).toMatchObject({ outcome: "given up", listTables: 1, queries: 3, refusedQueries: 3, refusals: [sentence, sentence, sentence] });
  });
});

describe("S-004 rework: the Server's version comes from the Worker's binding", () => {
  it("worker_adapter_reads_version_metadata_id", async () => {
    const id = "4dc70716-52c2-411c-8fc8-1b65af40d0ff";
    const HYPERDRIVE = { connectionString: "postgres://reader:pw@localhost:1/db" } as unknown as Hyperdrive;
    const notLoaded = async () => {
      throw new Error("the parser is not loaded in this test");
    };
    // The dependencies worker.ts gives createApp, built the way it builds them.
    const deps = workerDeps({ HYPERDRIVE, VERSION_METADATA: { id, tag: "release-tag", timestamp: "2026-10-30T00:00:00Z" } }, notLoaded);
    expect(deps.serverVersion).toBe(id);
    expect(workerDeps({ HYPERDRIVE }, notLoaded).serverVersion).toBeUndefined();
    const h = await harness({}, { realMcp: true, database: queryDatabase(), serverVersion: deps.serverVersion! });
    const token = (await signInToApp(h)).access_token;
    const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } };
    const body = (await (await callMcp(h, token, "/mcp", init)).json()) as { result: { serverInfo: { version: string } } };
    const pkg = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
    expect(body.result.serverInfo.version).toBe(`${pkg}+${id}`);
  });
});

describe("S-004 rework: the report redacts every credential in use", () => {
  it("report_redacts_every_credential_in_use", () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-creds-"));
    const cachePath = join(dir, ".signin.json");
    const cache = { deploymentUrl: ORIGIN, clientId: "client-id-secret-part", refreshToken: "refresh-token-from-cache" };
    writeFileSync(cachePath, JSON.stringify(cache));
    const env = { ANTHROPIC_API_KEY: "sk-ant-api03-from-env", ANTHROPIC_AUTH_TOKEN: "auth-token-from-env" };
    const secrets = credentialsInUse(env, cachePath);
    // A credential no list names, as from an `ant auth login` profile, is caught by its shape.
    const profileKey = "sk-ant-oat01-ProfileOnlyCredential_123";
    const row = {
      id: "B-01",
      outcome: "error" as const,
      given: null,
      expected: question.expected,
      queries: 0,
      listTables: 0,
      refusedQueries: 0,
      refusals: [],
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      durationMs: 0,
      error: `API failure: ${env.ANTHROPIC_API_KEY} ${env.ANTHROPIC_AUTH_TOKEN} ${cache.refreshToken} ${cache.clientId} ${profileKey}`,
    };
    const meta = {
      deploymentUrl: ORIGIN,
      server: { name: "s", version: "v" },
      model: "m",
      effort: "high",
      systemPrompt: "p",
      harnessCommit: "c",
      questionSetSha256: "h",
      runs: 1,
      startedAt: "2026-10-30T00:00:00.000Z",
    };
    const text = JSON.stringify(buildReport(meta, { runs: [[row]], stopped: null }, secrets));
    for (const s of [...Object.values(env), cache.refreshToken, cache.clientId, profileKey]) expect(text).not.toContain(s);
  });
});

describe("S-004 rework: renewing the Sign-in mid-run", () => {
  it("benchmark_renewal_survives_failed_reconnect", async () => {
    let clock = 0;
    let connects = 0;
    let failFrom = Infinity;
    const connect = async () => {
      connects++;
      if (connects === 2 || connects >= failFrom) throw new Error("network blip");
      const n = connects;
      return {
        server: { name: "s", version: "v", tools: [], call: async () => ({ content: [{ type: "text", text: `via connection ${n}` }] }), close: async () => {} },
        expiresAt: clock + 3_600_000,
      };
    };
    const server = await renewingServer({ connect, now: () => clock, renewBeforeMs: 300_000 });
    const via = async () => (await server.call("q", {})).content[0]!.text;
    expect(await via()).toBe("via connection 1");
    // Renewal is due but fails: the current token is still valid, so the call goes through on it (D-098).
    clock = 3_400_000;
    expect(await via()).toBe("via connection 1");
    // The next call renews again, and this time it works.
    expect(await via()).toBe("via connection 3");
    expect(connects).toBe(3);
    // Renewal fails from here on: the run carries on while the token lasts, then stops.
    failFrom = 4;
    clock = 6_800_000;
    expect(await via()).toBe("via connection 3");
    clock = 7_100_000;
    await expect(server.call("q", {})).rejects.toBeInstanceOf(StopInvocation);
  });
});

describe("S-004 rework: a browser Sign-in that never returns", () => {
  it("harness_signin_times_out_and_says_why", async () => {
    const h = await harness({}, { realMcp: true, database: queryDatabase() });
    const dir = mkdtempSync(join(tmpdir(), "bench-signin-"));
    const cachePath = join(dir, ".signin.json");
    writeFileSync(cachePath, JSON.stringify({ deploymentUrl: ORIGIN, clientId: "not-a-client", refreshToken: "not-a-token" }));
    const said: string[] = [];
    const attempt = signIn(ORIGIN, {
      fetch: async (input, init) => h.app.request(new Request(input, init)),
      openBrowser: () => {},
      listen: async () => ({ redirectUri: "http://127.0.0.1:54321/callback", result: new Promise<URLSearchParams>(() => {}), close: () => {} }),
      cachePath,
      timeoutMs: 50,
      log: (line) => said.push(line),
    });
    await expect(attempt).rejects.toThrow(/did not complete within/);
    expect(said.join("\n")).toMatch(/cached Refresh token was refused/);
  });
});
