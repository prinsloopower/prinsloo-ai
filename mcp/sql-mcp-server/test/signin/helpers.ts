import { base64url, exportJWK, generateKeyPair, SignJWT, UnsecuredJWT } from "jose";
import { vi } from "vitest";
import { createApp } from "../../src/app.js";
import type { Database } from "../../src/engine/database.js";
import type { QueryEngine } from "../../src/engine/database.js";

export const ORIGIN = "https://sql.example.com";
export const RESOURCE = `${ORIGIN}/mcp`;
export const ISSUER = "https://login.example.com/tenant/v2.0";
export const GOOGLE = "https://accounts.google.com";
export const SECRET = base64url.encode(new Uint8Array(32).fill(7));
export const OTHER_SECRET = base64url.encode(new Uint8Array(32).fill(9));
export const IDP_CLIENT_ID = "server-at-idp";
export const IDP_CLIENT_SECRET = "idp-client-secret-do-not-log";
export const CLIENT_REDIRECT = "https://claude.ai/api/mcp/auth_callback";
export const CIMD = "https://client.example.com/oauth/client.json";
export const JSON_HEADERS = { "content-type": "application/json" };

export type Env = Record<string, string | undefined>;

export function baseEnv(over: Env = {}): Env {
  return {
    SERVER_SECRET: SECRET,
    IDP_ISSUER: ISSUER,
    IDP_CLIENT_ID,
    IDP_CLIENT_SECRET,
    ...over,
  };
}

/** A clock the tests move by hand; tokens and caches read it through `now`. */
export class Clock {
  t = Date.UTC(2026, 9, 19, 12, 0, 0);
  now = () => this.t;
  advance(seconds: number) {
    this.t += seconds * 1000;
  }
  get sec() {
    return Math.floor(this.t / 1000);
  }
}

type Route = (req: Request, body: URLSearchParams) => Promise<Response> | Response;

/** Stand-in Identity provider and outside web, reached only through the `fetch` handed to the app. */
export class FakeIdentityProvider {
  calls: string[] = [];
  routes = new Map<string, Route>();
  kid = "k1";
  key!: CryptoKeyPair;
  extraKeys: { kid: string; alg: string; key: CryptoKey }[] = [];
  nonce: string | null = null;
  idClaims: Record<string, unknown> = {};
  refreshToken: string | undefined = "idp-refresh-1";
  tokenHandler?: Route;
  lastTokenBody?: URLSearchParams;

  private constructor(
    public clock: Clock,
    public issuer: string,
  ) {}

  static async create(clock: Clock, issuer = ISSUER) {
    const idp = new FakeIdentityProvider(clock, issuer);
    idp.key = await generateKeyPair("RS256", { extractable: true });
    idp.install();
    return idp;
  }

  private install() {
    const iss = this.issuer;
    this.routes.set(`${iss}/.well-known/openid-configuration`, () =>
      Response.json({
        issuer: iss,
        authorization_endpoint: `${iss}/authorize`,
        token_endpoint: `${iss}/token`,
        jwks_uri: `${iss}/keys`,
      }),
    );
    this.routes.set(`${iss}/keys`, async () => {
      const keys = [{ ...(await exportJWK(this.key.publicKey)), kid: this.kid, alg: "RS256", use: "sig" }];
      for (const extra of this.extraKeys) {
        keys.push({ ...(await exportJWK(extra.key)), kid: extra.kid, alg: extra.alg, use: "sig" });
      }
      return Response.json({ keys });
    });
    this.routes.set(`${iss}/token`, async (req, body) => {
      if (this.tokenHandler) return this.tokenHandler(req, body);
      return Response.json({
        token_type: "Bearer",
        access_token: "idp-access",
        id_token: await this.idToken(),
        ...(this.refreshToken ? { refresh_token: this.refreshToken } : {}),
      });
    });
  }

  claims(over: Record<string, unknown> = {}) {
    const now = this.clock.sec;
    return {
      iss: this.issuer,
      aud: IDP_CLIENT_ID,
      sub: "staff-123",
      name: "Ada Analyst",
      iat: now,
      exp: now + 3600,
      ...(this.nonce ? { nonce: this.nonce } : {}),
      ...this.idClaims,
      ...over,
    };
  }

  async idToken(over: Record<string, unknown> = {}, opts: { alg?: string; kid?: string; key?: CryptoKey | Uint8Array } = {}) {
    const alg = opts.alg ?? "RS256";
    if (alg === "none") return new UnsecuredJWT(this.claims(over)).encode();
    return new SignJWT(this.claims(over))
      .setProtectedHeader({ alg, kid: opts.kid ?? this.kid, typ: "JWT" })
      .sign(opts.key ?? this.key.privateKey);
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const key = `${url.origin}${url.pathname}`;
    this.calls.push(key);
    const body = req.method === "POST" ? new URLSearchParams(await req.clone().text()) : new URLSearchParams();
    if (key === `${this.issuer}/token`) this.lastTokenBody = body;
    const route = this.routes.get(key);
    const res = route ? await route(req, body) : new Response("not found", { status: 404 });
    // Like a real fetch: follow a redirect unless the caller asked for "manual".
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location && init?.redirect !== "manual") {
      return this.fetch(new URL(location, req.url).href, { ...init, method: "GET", body: undefined });
    }
    return res;
  };

  callsTo(path: string) {
    return this.calls.filter((c) => c === `${this.issuer}${path}`).length;
  }
}

/** The app as tests drive it; URLs read out of responses arrive typed as possibly undefined. */
export interface TestApp {
  request(input: string | URL | Request | undefined, init?: RequestInit): Response | Promise<Response>;
}

export interface Harness {
  app: TestApp;
  idp: FakeIdentityProvider;
  clock: Clock;
  staffSeen: unknown[];
}

/** One app over a fake Identity provider. `realMcp` swaps the spy handler for the SDK one. */
export async function harness(
  envOver: Env = {},
  opts: { realMcp?: boolean; clock?: Clock; database?: Database; queries?: () => Promise<QueryEngine> } = {},
): Promise<Harness> {
  const clock = opts.clock ?? new Clock();
  const env = baseEnv(envOver);
  const idp = await FakeIdentityProvider.create(clock, env.IDP_ISSUER ?? ISSUER);
  const staffSeen: unknown[] = [];
  const hono = createApp({
    ping: async () => {},
    env,
    fetch: idp.fetch,
    now: clock.now,
    ...(opts.database ? { database: opts.database } : {}),
    ...(opts.queries ? { queries: opts.queries } : {}),
    ...(opts.realMcp
      ? {}
      : {
          mcpHandler: async (_req: Request, staff: unknown) => {
            staffSeen.push(staff);
            return Response.json({ reached: true });
          },
        }),
  });
  const app: TestApp = { request: (input, init) => hono.request(input ?? "", init) };
  return { app, idp, clock, staffSeen };
}

/** Change one character in the middle of a token's longest segment. */
export function flip(token: string): string {
  const parts = token.split(".");
  const i = parts.reduce((best, p, idx) => (p.length > (parts[best] ?? "").length ? idx : best), 0);
  const seg = parts[i] ?? "";
  const at = Math.floor(seg.length / 2);
  parts[i] = seg.slice(0, at) + (seg[at] === "A" ? "B" : "A") + seg.slice(at + 1);
  return parts.join(".");
}

export async function pkce() {
  const verifier = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url.encode(new Uint8Array(digest)) };
}

export async function register(h: Harness, redirectUris: string[] = [CLIENT_REDIRECT], clientName = "Claude") {
  return h.app.request(`${ORIGIN}/register`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ redirect_uris: redirectUris, client_name: clientName }),
  });
}

export async function registeredClient(h: Harness, redirect = CLIENT_REDIRECT) {
  const res = await register(h, [redirect]);
  return ((await res.json()) as { client_id: string }).client_id;
}

export interface AuthorizeParams {
  clientId: string;
  challenge?: string | null;
  method?: string;
  redirect?: string | null;
  resource?: string;
  responseType?: string;
  state?: string;
}

export interface AuthorizeResult {
  res: Response;
  location: URL | null;
  state: string | null;
  cookie: string | null;
  setCookie: string | null;
}

export async function authorize(h: Harness, p: AuthorizeParams): Promise<AuthorizeResult> {
  const q = new URLSearchParams();
  q.set("response_type", p.responseType ?? "code");
  q.set("client_id", p.clientId);
  if (p.redirect !== null) q.set("redirect_uri", p.redirect ?? CLIENT_REDIRECT);
  if (p.challenge !== null && p.challenge !== undefined) q.set("code_challenge", p.challenge);
  q.set("code_challenge_method", p.method ?? "S256");
  q.set("resource", p.resource ?? RESOURCE);
  q.set("state", p.state ?? "client-state-xyz");
  const res = await h.app.request(`${ORIGIN}/authorize?${q}`);
  const loc = res.headers.get("location");
  const location = loc ? new URL(loc) : null;
  const setCookie = res.headers.get("set-cookie");
  const cookie = setCookie?.match(/__Host-sqlmcp-auth=([^;]+)/)?.[1] ?? null;
  if (location && location.href.startsWith(h.idp.issuer)) h.idp.nonce = location.searchParams.get("nonce");
  return { res, location, state: location?.searchParams.get("state") ?? null, cookie, setCookie };
}

export async function begin(h: Harness, over: Partial<AuthorizeParams> = {}) {
  const clientId = over.clientId ?? (await registeredClient(h));
  const { verifier, challenge } = await pkce();
  const a = await authorize(h, { clientId, challenge, ...over });
  if (!a.state || !a.cookie) throw new Error(`authorize did not reach the Identity provider: ${a.res.status}`);
  return { clientId, verifier, challenge, state: a.state, cookie: a.cookie };
}

export async function callback(h: Harness, p: { state: string; cookie?: string | null; code?: string; error?: string }) {
  const q = new URLSearchParams({ state: p.state });
  if (p.error) q.set("error", p.error);
  else q.set("code", p.code ?? "idp-code-1");
  const headers: Record<string, string> = {};
  if (p.cookie) headers.cookie = `__Host-sqlmcp-auth=${p.cookie}`;
  return h.app.request(`${ORIGIN}/oauth/callback?${q}`, { headers });
}

export async function codeFor(h: Harness, over: Partial<AuthorizeParams> = {}) {
  const b = await begin(h, over);
  const res = await callback(h, b);
  const loc = res.headers.get("location");
  const code = loc ? new URL(loc).searchParams.get("code") : null;
  if (!code) throw new Error(`callback gave no code: ${res.status} ${await res.text()}`);
  return { ...b, code };
}

export async function token(h: Harness, form: Record<string, string>) {
  return h.app.request(`${ORIGIN}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
}

export interface Issued {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  clientId: string;
}

export async function signIn(h: Harness, over: Partial<AuthorizeParams> = {}): Promise<Issued> {
  const c = await codeFor(h, over);
  const res = await token(h, {
    grant_type: "authorization_code",
    code: c.code,
    redirect_uri: over.redirect ?? CLIENT_REDIRECT,
    client_id: c.clientId,
    code_verifier: c.verifier,
    resource: over.resource ?? RESOURCE,
  });
  if (res.status !== 200) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return { ...((await res.json()) as Omit<Issued, "clientId">), clientId: c.clientId };
}

export async function callMcp(h: Harness, accessToken: string | null, path = "/mcp", body: unknown = { jsonrpc: "2.0", id: 1, method: "tools/list" }) {
  const headers: Record<string, string> = { ...JSON_HEADERS, accept: "application/json, text/event-stream" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return h.app.request(`${ORIGIN}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

/** Every line written to the console while `fn` runs. */
export async function captureConsole(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of Object.keys(orig) as (keyof typeof orig)[]) {
    console[k] = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  }
  try {
    await fn();
  } finally {
    Object.assign(console, orig);
  }
  return lines;
}

/**
 * Waits on real time until `count` fake timers are armed. Crypto between a request
 * and its fetch completes on real time, so advancing fake time earlier would skip it.
 */
export async function timersArmed(count: number) {
  for (let i = 0; i < 10_000 && vi.getTimerCount() < count; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (vi.getTimerCount() < count) throw new Error(`only ${vi.getTimerCount()} of ${count} timers armed`);
}

export function opLines(lines: string[]) {
  return lines
    .map((l) => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((l): l is Record<string, unknown> => l?.type === "op");
}
