import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

/** Where the Identity provider's sign-in comes back to: a plain-http listener on 127.0.0.1, any port (D-072). */
export type Loopback = { redirectUri: string; result: Promise<URLSearchParams>; close(): void };
export type SignInDeps = {
  fetch: typeof fetch;
  openBrowser(url: string): Promise<void> | void;
  listen(): Promise<Loopback>;
  /** `bench/.signin.json`, which is gitignored. */
  cachePath: string;
  /** How long to wait for the browser sign-in to come back; ten minutes unless given. */
  timeoutMs?: number;
  /** False for a renewal mid-run: only the cached Refresh token is used, and the browser is never opened (D-098). */
  interactive?: boolean;
  log?: (line: string) => void;
};

const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000;

/** What `bench/.signin.json` holds: one Deployment's client and Refresh token. Never written to a report. */
type Cache = { deploymentUrl: string; clientId: string; refreshToken: string };

/** The client registers this, and the Server accepts it with any port (D-072). */
const REGISTERED_REDIRECT = "http://127.0.0.1/callback";

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

/**
 * Signs in as a Staff member through the Deployment's own Sign-in broker, as an AI tool does: the cached
 * Refresh token when it still works, otherwise stateless registration, PKCE S256 and one browser sign-in.
 */
export async function signIn(deploymentUrl: string, deps: SignInDeps): Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }> {
  const base = new URL(deploymentUrl).origin;
  const resource = `${base}/mcp`;
  const cached = readCache(deps.cachePath);
  if (cached && cached.deploymentUrl === base) {
    const res = await tokenRequest(deps, base, {
      grant_type: "refresh_token",
      refresh_token: cached.refreshToken,
      client_id: cached.clientId,
      resource,
    });
    if (res.ok) {
      const t = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
      writeCache(deps.cachePath, { ...cached, refreshToken: t.refresh_token ?? cached.refreshToken });
      return { accessToken: t.access_token, expiresIn: t.expires_in, ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}) };
    }
    if (deps.interactive === false) throw new Error(`the cached Refresh token was refused (${res.status})`);
    (deps.log ?? console.log)(`The cached Refresh token was refused (${res.status}), so the Staff member signs in again in the browser.`);
  }
  if (deps.interactive === false) throw new Error("there is no cached Refresh token for this Deployment");

  const registration = await deps.fetch(`${base}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: [REGISTERED_REDIRECT], client_name: "sql-mcp-server benchmark" }),
  });
  if (!registration.ok) throw new Error(`registration failed: ${registration.status}`);
  const clientId = ((await registration.json()) as { client_id: string }).client_id;

  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const loopback = await deps.listen();
  let code: string;
  try {
    const q = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: loopback.redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource,
      state,
    });
    await deps.openBrowser(`${base}/authorize?${q}`);
    const timeoutMs = deps.timeoutMs ?? SIGN_IN_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`the browser sign-in did not complete within ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
    });
    const back = await Promise.race([loopback.result, timedOut]).finally(() => clearTimeout(timer));
    if (back.get("state") !== state) throw new Error("the sign-in came back with a different state");
    const c = back.get("code");
    if (!c) throw new Error(`the sign-in did not complete: ${back.get("error") ?? "no code"}`);
    code = c;
  } finally {
    loopback.close();
  }

  const res = await tokenRequest(deps, base, {
    grant_type: "authorization_code",
    code,
    redirect_uri: loopback.redirectUri,
    client_id: clientId,
    code_verifier: verifier,
    resource,
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const t = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  if (t.refresh_token) writeCache(deps.cachePath, { deploymentUrl: base, clientId, refreshToken: t.refresh_token });
  return { accessToken: t.access_token, expiresIn: t.expires_in, ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}) };
}

function tokenRequest(deps: SignInDeps, base: string, form: Record<string, string>) {
  return deps.fetch(`${base}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
}

/** What the Sign-in cache at `path` holds that a report must never show: every field but the Deployment URL. */
export function cacheSecrets(path: string): string[] {
  const cache = readCache(path);
  if (!cache) return [];
  return Object.entries(cache).flatMap(([field, value]) => (field !== "deploymentUrl" && typeof value === "string" ? [value] : []));
}

function readCache(path: string): Cache | null {
  if (!existsSync(path)) return null;
  try {
    const c = JSON.parse(readFileSync(path, "utf8")) as Partial<Cache>;
    return c.deploymentUrl && c.clientId && c.refreshToken ? (c as Cache) : null;
  } catch {
    return null;
  }
}

function writeCache(path: string, cache: Cache) {
  writeFileSync(path, JSON.stringify(cache, null, 2) + "\n", { mode: 0o600 });
}

/** Listens on 127.0.0.1 on a free port for the sign-in to come back, and tells the browser it can close. */
export function listenOnLoopback(): Promise<Loopback> {
  return new Promise((resolve, reject) => {
    let deliver: (q: URLSearchParams) => void = () => {};
    const result = new Promise<URLSearchParams>((r) => (deliver = r));
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Signed in. You can close this window and return to the benchmark.");
      deliver(url.searchParams);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("no loopback port"));
      resolve({ redirectUri: `http://127.0.0.1:${address.port}/callback`, result, close: () => server.close() });
    });
  });
}

/** Opens the system browser at `url`, and prints it in case that fails. */
export function openSystemBrowser(url: string) {
  console.log(`Sign in to the Server in your browser. If it does not open, visit:\n${url}`);
  const [cmd, args, opts] =
    process.platform === "win32"
      ? (["cmd", [`/c start "" "${url}"`], { windowsVerbatimArguments: true }] as const)
      : process.platform === "darwin"
        ? (["open", [url], {}] as const)
        : (["xdg-open", [url], {}] as const);
  spawn(cmd, [...args], { ...opts, stdio: "ignore", detached: true }).on("error", () => {}).unref();
}
