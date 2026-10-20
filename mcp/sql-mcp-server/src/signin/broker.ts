import type { Hono } from "hono";
import { GOOGLE_ISSUER, type Config } from "../config.js";
import { lookupClient, registerClient } from "./clients.js";
import { IdentityProvider, IdentityProviderRefused, IdentityProviderUnavailable, IdTokenInvalid } from "./identity-provider.js";
import { op } from "../oplog.js";
import type { Tokens, TokenPayload } from "./tokens.js";
import { cookieValue, randomToken, s256, SKEW_S, type Fetch } from "./util.js";

/** Who a signed-in request comes from, as the Sign-in broker hands it to the MCP endpoint (R-009). */
export interface Staff {
  sub: string;
  name: string;
  iss: string;
}

const COOKIE = "__Host-sqlmcp-auth";
const REQUEST_S = 10 * 60;
const CODE_S = 60;
const SIGNIN_MAX_S = 24 * 60 * 60;
const REFRESH_S = 30 * 24 * 60 * 60;

/** The plain-text pages a Staff member's browser can land on during Sign-in (S-001 Screens). */
export const PAGES = {
  notConfigured: "Sign-in is not configured on this Deployment",
  notValid: "This AI tool's sign-in request is not valid",
  providerDown: (issuer: string) => `The Identity provider at ${issuer} did not answer`,
  expired: "This sign-in started more than 10 minutes ago. Start again from your AI tool",
  otherBrowser: "This sign-in was started in a different browser. Start again from your AI tool",
  refused: (code: string) => `The Identity provider refused the sign-in: ${code}`,
  notVerified: "The sign-in could not be verified. Start again from your AI tool",
  serverError: "The sign-in failed on the Server. Start again from your AI tool",
};

export function page(text: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...headers } });
}

function errorCode(raw: string): string {
  return /^[A-Za-z0-9_.-]{1,64}$/.test(raw) ? raw : "unknown_error";
}

export interface BrokerDeps {
  config: Config;
  tokens: () => Promise<Tokens>;
  provider?: IdentityProvider;
  fetch: Fetch;
  now: () => number;
}

/** The Sign-in broker (components.md): the Server as its own OAuth 2.1 authorization server (ADR-004). */
export class SignInBroker {
  constructor(private readonly deps: BrokerDeps) {}

  private get nowS(): number {
    return Math.floor(this.deps.now() / 1000);
  }

  origin(requestUrl: string): string {
    return this.deps.config.publicUrl ?? new URL(requestUrl).origin;
  }

  get configured(): boolean {
    return this.deps.provider !== undefined;
  }

  private ownResource(resource: string, origin: string): boolean {
    let u: URL;
    try {
      u = new URL(resource);
    } catch {
      return false;
    }
    return u.origin === origin && (u.pathname === "/mcp" || u.pathname.startsWith("/mcp/")) && !u.search && !u.hash;
  }

  /** The Staff member a request is signed in as, or why not. */
  async verify(request: Request): Promise<{ staff: Staff } | { error: "missing" | "invalid" }> {
    const header = request.headers.get("authorization");
    if (!header) return { error: "missing" };
    const presented = /^Bearer\s+(\S+)$/i.exec(header.trim())?.[1];
    if (!presented || !this.deps.provider) return { error: "invalid" };
    const p = await (await this.deps.tokens()).open("signin", presented);
    if (!p || p.iss !== this.deps.provider.issuer) return { error: "invalid" };
    if (p.aud !== `${this.origin(request.url)}${new URL(request.url).pathname}`) return { error: "invalid" };
    if (typeof p.exp !== "number" || this.nowS > p.exp + SKEW_S) return { error: "invalid" };
    return { staff: { sub: String(p.sub), name: String(p.name), iss: String(p.iss) } };
  }

  mount(app: Hono): void {
    app.get("/.well-known/oauth-authorization-server", (c) => {
      const origin = this.origin(c.req.url);
      return c.json({
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        registration_endpoint: `${origin}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        client_id_metadata_document_supported: true,
      });
    });

    app.post("/register", async (c) => {
      const input = await c.req.json().catch(() => null);
      const reg = await registerClient(input, await this.deps.tokens(), this.nowS);
      return c.json(reg.body, reg.status, { "cache-control": "no-store" });
    });

    app.get("/authorize", (c) => this.authorize(c.req.url));
    app.get("/oauth/callback", (c) => this.callback(c.req.url, c.req.header("cookie")));
    app.post("/token", async (c) => this.token(new URLSearchParams(await c.req.text())));
  }

  private async authorize(requestUrl: string): Promise<Response> {
    const provider = this.deps.provider;
    if (!provider) return page(PAGES.notConfigured, 503);
    const q = new URL(requestUrl).searchParams;
    const origin = this.origin(requestUrl);
    const tokens = await this.deps.tokens();

    // Until the client and its redirect URI are known, sending the browser anywhere would be unsafe.
    const clientId = q.get("client_id") ?? "";
    const client = await lookupClient(clientId, tokens, this.deps.fetch);
    const redirectUri = q.get("redirect_uri");
    if (!client || !redirectUri || !client.redirectUris.includes(redirectUri)) return page(PAGES.notValid, 400);

    const clientState = q.get("state") ?? "";
    const refuse = () => {
      const back = new URL(redirectUri);
      back.searchParams.set("error", "invalid_request");
      if (clientState) back.searchParams.set("state", clientState);
      return new Response(null, { status: 302, headers: { location: back.href, "cache-control": "no-store" } });
    };
    const challenge = q.get("code_challenge") ?? "";
    const resource = q.get("resource") ?? "";
    if (q.get("response_type") !== "code") return refuse();
    if (q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return refuse();
    if (!this.ownResource(resource, origin)) return refuse();

    let endpoint: string;
    try {
      endpoint = (await provider.discovery()).authorization_endpoint;
    } catch {
      return page(PAGES.providerDown(provider.issuer), 502);
    }
    const cookie = randomToken();
    const nonce = randomToken(16);
    const providerVerifier = randomToken();
    const state = await tokens.issue("authreq", {
      v: 1,
      client_id: clientId,
      redirect_uri: redirectUri,
      client_state: clientState,
      code_challenge: challenge,
      resource,
      idp_verifier: providerVerifier,
      nonce,
      cookie_hash: await s256(cookie),
      exp: this.nowS + REQUEST_S,
    });
    const to = new URL(endpoint);
    to.searchParams.set("response_type", "code");
    to.searchParams.set("client_id", provider.clientId);
    to.searchParams.set("redirect_uri", `${origin}/oauth/callback`);
    to.searchParams.set("scope", provider.scopes);
    to.searchParams.set("state", state);
    to.searchParams.set("nonce", nonce);
    to.searchParams.set("code_challenge", await s256(providerVerifier));
    to.searchParams.set("code_challenge_method", "S256");
    if (provider.issuer === GOOGLE_ISSUER) {
      to.searchParams.set("access_type", "offline");
      to.searchParams.set("prompt", "consent");
    }
    return new Response(null, {
      status: 302,
      headers: {
        location: to.href,
        "set-cookie": `${COOKIE}=${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${REQUEST_S}`,
        "cache-control": "no-store",
      },
    });
  }

  private async callback(requestUrl: string, cookieHeader: string | undefined): Promise<Response> {
    const provider = this.deps.provider;
    if (!provider) return page(PAGES.notConfigured, 503);
    const q = new URL(requestUrl).searchParams;
    const tokens = await this.deps.tokens();

    const req = await tokens.open("authreq", q.get("state") ?? "");
    if (!req) return page(PAGES.notVerified, 400);
    if (typeof req.exp !== "number" || this.nowS > req.exp) return page(PAGES.expired, 400);
    const cookie = cookieValue(cookieHeader, COOKIE);
    if (!cookie || (await s256(cookie)) !== req.cookie_hash) return page(PAGES.otherBrowser, 400);
    const error = q.get("error");
    if (error) return page(PAGES.refused(errorCode(error)), 400);
    const code = q.get("code");
    if (!code) return page(PAGES.notVerified, 400);

    let claims;
    let answer;
    try {
      answer = await provider.exchangeCode(code, String(req.idp_verifier), `${this.origin(requestUrl)}/oauth/callback`);
      claims = await provider.verifyIdToken(answer.idToken, { nonce: String(req.nonce) });
    } catch (e) {
      if (e instanceof IdentityProviderRefused) return page(PAGES.refused(errorCode(e.code)), 400);
      if (e instanceof IdentityProviderUnavailable) return page(PAGES.providerDown(provider.issuer), 502);
      if (e instanceof IdTokenInvalid) return page(PAGES.notVerified, 400);
      // Anything else is a fault in the Server, not a forged sign-in: say so, and leave a trace (D-068).
      op("signin_error", { endpoint: "callback" });
      return page(PAGES.serverError, 500);
    }

    const authCode = await tokens.issue("code", {
      v: 1,
      sub: claims.sub,
      name: claims.name,
      iss: provider.issuer,
      client_id: req.client_id,
      redirect_uri: req.redirect_uri,
      resource: req.resource,
      code_challenge: req.code_challenge,
      id_exp: claims.exp,
      ...(answer.refreshToken ? { idp_refresh: answer.refreshToken } : {}),
      // The provider's own refresh lifetime, when it states one, caps the Refresh token (D-070).
      ...(answer.refreshExpiresIn ? { idp_refresh_exp: this.nowS + answer.refreshExpiresIn } : {}),
      exp: this.nowS + CODE_S,
    });
    const back = new URL(String(req.redirect_uri));
    back.searchParams.set("code", authCode);
    if (req.client_state) back.searchParams.set("state", String(req.client_state));
    return new Response(null, {
      status: 302,
      headers: {
        location: back.href,
        "set-cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
        "cache-control": "no-store",
      },
    });
  }

  private async token(form: URLSearchParams): Promise<Response> {
    const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
    const provider = this.deps.provider;
    if (!provider) return fail("invalid_request");
    const tokens = await this.deps.tokens();
    const clientId = form.get("client_id") ?? "";
    if (!(await lookupClient(clientId, tokens, this.deps.fetch))) return fail("invalid_client", 401);
    const resource = form.get("resource");

    if (form.get("grant_type") === "authorization_code") {
      const code = await tokens.open("code", form.get("code") ?? "");
      if (!code || typeof code.exp !== "number" || this.nowS > code.exp) return fail("invalid_grant");
      if (code.client_id !== clientId || code.redirect_uri !== form.get("redirect_uri") || code.iss !== provider.issuer) return fail("invalid_grant");
      if (resource !== null && resource !== code.resource) return fail("invalid_grant");
      const verifier = form.get("code_verifier");
      if (!verifier || (await s256(verifier)) !== code.code_challenge) return fail("invalid_grant");
      const providerLimit = typeof code.idp_refresh_exp === "number" ? code.idp_refresh_exp : Infinity;
      return this.issue(tokens, code, String(code.name), Number(code.id_exp), { notAfter: Math.min(this.nowS + REFRESH_S, providerLimit) });
    }

    if (form.get("grant_type") === "refresh_token") {
      const presented = form.get("refresh_token") ?? "";
      const refresh = await tokens.open("refresh", presented);
      if (!refresh || typeof refresh.exp !== "number" || this.nowS > refresh.exp) return fail("invalid_grant");
      if (refresh.client_id !== clientId || refresh.iss !== provider.issuer) return fail("invalid_grant");
      if (resource !== null && resource !== refresh.aud) return fail("invalid_grant");
      let answer;
      let claims;
      try {
        answer = await provider.refresh(String(refresh.idp_refresh));
        claims = await provider.verifyIdToken(answer.idToken);
      } catch (e) {
        if (e instanceof IdentityProviderUnavailable) return fail("temporarily_unavailable", 503);
        if (e instanceof IdentityProviderRefused || e instanceof IdTokenInvalid) return fail("invalid_grant");
        op("signin_error", { endpoint: "token" });
        return fail("server_error", 500);
      }
      if (claims.sub !== refresh.sub) return fail("invalid_grant");
      if (!answer.refreshToken || answer.refreshToken === refresh.idp_refresh) {
        return this.issue(tokens, { sub: refresh.sub, client_id: clientId, resource: refresh.aud }, claims.name, claims.exp, { keep: presented });
      }
      // The provider rotated its refresh token: carry the new one, but never past the
      // presented token's own expiry, so a chain of renewals ends 30 days after Sign-in (Q-025, D-071).
      const providerLimit = answer.refreshExpiresIn ? this.nowS + answer.refreshExpiresIn : Infinity;
      return this.issue(
        tokens,
        { sub: refresh.sub, client_id: clientId, resource: refresh.aud, idp_refresh: answer.refreshToken },
        claims.name,
        claims.exp,
        { notAfter: Math.min(refresh.exp, providerLimit) },
      );
    }

    return fail("unsupported_grant_type");
  }

  /**
   * A Sign-in ending at the ID token's expiry and never later than 24 hours (D-024), plus a
   * Refresh token: the presented one kept, or a new one ending at `notAfter` when the grant
   * carries a provider refresh token.
   */
  private async issue(
    tokens: Tokens,
    grant: TokenPayload,
    name: string,
    idExp: number,
    refresh: { keep: string } | { notAfter: number },
  ): Promise<Response> {
    const provider = this.deps.provider!;
    const iat = this.nowS;
    const exp = Math.min(idExp, iat + SIGNIN_MAX_S);
    const accessToken = await tokens.issue("signin", {
      v: 1,
      sub: grant.sub,
      name,
      iss: provider.issuer,
      aud: grant.resource,
      client_id: grant.client_id,
      iat,
      exp,
    });
    let refreshToken: string | undefined;
    if ("keep" in refresh) {
      refreshToken = refresh.keep;
    } else if (typeof grant.idp_refresh === "string") {
      refreshToken = await tokens.issue("refresh", {
        v: 1,
        sub: grant.sub,
        iss: provider.issuer,
        aud: grant.resource,
        client_id: grant.client_id,
        idp_refresh: grant.idp_refresh,
        iat,
        exp: refresh.notAfter,
      });
    }
    return Response.json(
      { access_token: accessToken, token_type: "Bearer", expires_in: exp - iat, ...(refreshToken ? { refresh_token: refreshToken } : {}) },
      { headers: { "cache-control": "no-store" } },
    );
  }
}