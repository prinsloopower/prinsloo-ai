import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { base64url } from "jose";
import { describe, expect, it } from "vitest";
import { exitCodeFor, InvocationStopped } from "../../bench/src/harness.js";
import { connectServer, signedInServer } from "../../bench/src/server.js";
import { LIST_TABLES } from "../../src/tools/list-tables.js";
import { type Loopback, signIn } from "../../bench/src/signin.js";
import { queryDatabase } from "../query/catalog.js";
import { nodeQueryEngine } from "../query/node-parser.js";
import { type Harness, ORIGIN, RESOURCE, callback, harness } from "../signin/helpers.js";

const REDIRECT = "http://127.0.0.1:54321/callback";

/** The Staff member's browser and the harness's loopback listener, simulated against the app. */
function world(h: Harness) {
  const requests: { path: string; body: string }[] = [];
  const opened: string[] = [];
  let deliver: (q: URLSearchParams) => void = () => {};
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    requests.push({ path: new URL(req.url).pathname, body: req.method === "POST" ? await req.clone().text() : "" });
    return h.app.request(req);
  };
  const listen = async (): Promise<Loopback> => ({
    redirectUri: REDIRECT,
    result: new Promise<URLSearchParams>((resolve) => (deliver = resolve)),
    close: () => {},
  });
  const openBrowser = async (url: string) => {
    opened.push(url);
    // The browser follows the Server to the Identity provider, signs in there, and comes back.
    const toIdp = await h.app.request(url);
    const at = new URL(toIdp.headers.get("location")!);
    h.idp.nonce = at.searchParams.get("nonce");
    const cookie = toIdp.headers.get("set-cookie")!.match(/__Host-sqlmcp-auth=([^;]+)/)![1]!;
    const back = await callback(h, { state: at.searchParams.get("state")!, cookie });
    const toLoopback = new URL(back.headers.get("location")!);
    expect(`${toLoopback.origin}${toLoopback.pathname}`).toBe(REDIRECT);
    deliver(toLoopback.searchParams);
  };
  return { requests, opened, deps: { fetch, listen, openBrowser } };
}

const cacheFile = () => join(mkdtempSync(join(tmpdir(), "bench-signin-")), ".signin.json");
const form = (body: string) => Object.fromEntries(new URLSearchParams(body));

describe("S-004 the harness's Sign-in", () => {
  it("harness_signs_in_with_loopback_and_pkce", async () => {
    const h = await harness({}, { realMcp: true, database: queryDatabase(), queryEngine: nodeQueryEngine });
    const w = world(h);
    const session = await signIn(ORIGIN, { ...w.deps, cachePath: cacheFile() });
    expect(w.opened).toHaveLength(1);

    const registration = w.requests.find((r) => r.path === "/register")!;
    expect(JSON.parse(registration.body)).toMatchObject({ redirect_uris: ["http://127.0.0.1/callback"] });
    const auth = new URL(w.opened[0]!).searchParams;
    expect(Object.fromEntries(auth)).toMatchObject({ response_type: "code", redirect_uri: REDIRECT, code_challenge_method: "S256", resource: RESOURCE });
    const exchange = form(w.requests.find((r) => r.path === "/token")!.body);
    expect(exchange).toMatchObject({ grant_type: "authorization_code", redirect_uri: REDIRECT, client_id: auth.get("client_id") });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(exchange.code_verifier));
    expect(base64url.encode(new Uint8Array(digest))).toBe(auth.get("code_challenge"));

    const server = await connectServer(ORIGIN, session.accessToken, w.deps.fetch);
    expect(server).toMatchObject({ name: "sql-mcp-server", version: "0.0.1" });
    expect(server.tools.map((t) => t.name)).toEqual(["list_tables", "query"]);
    const listed = await server.call("list_tables", { request_text: "Which tables can I query?" });
    expect(listed.isError ?? false).toBe(false);
    expect(w.requests.filter((r) => r.path === "/mcp").length).toBeGreaterThan(0);
  });

  it("harness_reuses_cached_refresh_token", async () => {
    const h = await harness({}, { realMcp: true, database: queryDatabase(), queryEngine: nodeQueryEngine });
    const w = world(h);
    const cachePath = cacheFile();
    await signIn(ORIGIN, { ...w.deps, cachePath });
    const firstCache = readFileSync(cachePath, "utf8");

    h.clock.advance(7200);
    const again = await signIn(ORIGIN, { ...w.deps, cachePath });
    expect(w.opened).toHaveLength(1);
    const refresh = form(w.requests.filter((r) => r.path === "/token").at(-1)!.body);
    expect(refresh).toMatchObject({ grant_type: "refresh_token", refresh_token: JSON.parse(firstCache).refreshToken });
    const server = await connectServer(ORIGIN, again.accessToken, w.deps.fetch);
    expect(server.tools.map((t) => t.name)).toEqual(["list_tables", "query"]);

    // A cache made for another Deployment is not used there.
    await signIn("https://other.example.com", {
      ...w.deps,
      fetch: (input, init) => w.deps.fetch(String(input).replace("https://other.example.com", ORIGIN), init),
      cachePath,
    }).catch(() => {});
    expect(w.opened).toHaveLength(2);
  });

  it("signin_cache_is_gitignored", () => {
    expect(readFileSync(".gitignore", "utf8").split(/\r?\n/)).toContain("bench/.signin.json");
    execFileSync("git", ["check-ignore", "-q", "bench/.signin.json"]);
  });
});

describe("S-004 the harness's Sign-in, after review 2 (D-098)", () => {
  it("harness_renewal_never_opens_browser", async () => {
    const h = await harness({}, { realMcp: true, database: queryDatabase(), queryEngine: nodeQueryEngine });
    const w = world(h);
    const cachePath = cacheFile();
    await signIn(ORIGIN, { ...w.deps, cachePath });
    expect(w.opened).toHaveLength(1);
    // A renewal mid-run uses the Refresh token and nothing else.
    const renewed = await signIn(ORIGIN, { ...w.deps, cachePath, interactive: false });
    expect(renewed.accessToken.length).toBeGreaterThan(0);
    writeFileSync(cachePath, JSON.stringify({ deploymentUrl: ORIGIN, clientId: "not-a-client", refreshToken: "not-a-token" }));
    await expect(signIn(ORIGIN, { ...w.deps, cachePath, interactive: false, log: () => {} })).rejects.toThrow(/refused/);
    expect(w.opened).toHaveLength(1);
  });
});

describe("S-004 the benchmark's Sign-in over a run, after review 3", () => {
  it("benchmark_renews_sign_in_without_browser_and_exits_1", async () => {
    const h = await harness({}, { realMcp: true, database: queryDatabase(), queryEngine: nodeQueryEngine });
    const w = world(h);
    const cachePath = cacheFile();
    // The wiring bench/run.ts uses, on the app's clock.
    const server = await signedInServer(ORIGIN, { ...w.deps, cachePath, log: () => {} }, () => h.clock.t);
    expect(w.opened).toHaveLength(1);
    const ask = async () => (await server.call(LIST_TABLES, { request_text: "Which tables can I query?" })).isError ?? false;
    expect(await ask()).toBe(false);

    // Near the hour, the Sign-in is renewed from the cache, with no browser.
    h.clock.advance(3500);
    expect(await ask()).toBe(false);
    expect(w.opened).toHaveLength(1);

    // Then the cached token is refused: the run goes on while the current token lasts, and then stops.
    writeFileSync(cachePath, JSON.stringify({ deploymentUrl: ORIGIN, clientId: "not-a-client", refreshToken: "not-a-token" }));
    h.clock.advance(3400);
    expect(await ask()).toBe(false);
    h.clock.advance(300);
    await expect(server.call(LIST_TABLES, { request_text: "Which tables can I query?" })).rejects.toBeInstanceOf(InvocationStopped);
    expect(w.opened).toHaveLength(1);

    // A run stopped because its Sign-in could not be renewed did not complete, so the command exits 1.
    expect(exitCodeFor("signin")).toBe(1);
    expect(exitCodeFor("ceiling")).toBe(0);
    expect(exitCodeFor(null)).toBe(0);
  });
});
