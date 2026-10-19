import { createLocalJWKSet, decodeProtectedHeader, jwtVerify, type JSONWebKeySet } from "jose";
import type { IdpSettings } from "../config.js";
import { op } from "../oplog.js";
import { within, type Fetch } from "./util.js";

/** Every Identity provider call gives up after this long (security.md). */
const CALL_MS = 5000;
/** Discovery and keys are kept this long per isolate or process. */
const CACHE_MS = 10 * 60 * 1000;
/** An unknown key ID refetches the keys at most this often. */
const UNKNOWN_KID_GAP_MS = 60 * 1000;
const ALGORITHMS = ["RS256", "PS256", "ES256"];
const SKEW_S = 60;

type Endpoint = "discovery" | "jwks" | "token";

export class IdpUnreachable extends Error {
  constructor(readonly endpoint: Endpoint) {
    super(`Identity provider ${endpoint} did not answer`);
  }
}

export class IdpRefused extends Error {
  constructor(readonly code: string) {
    super(`Identity provider refused: ${code}`);
  }
}

export class IdTokenInvalid extends Error {}

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

export interface IdTokenClaims {
  sub: string;
  name: string;
  exp: number;
}

export interface ProviderTokens {
  idToken?: string;
  refreshToken?: string;
  refreshExpiresIn?: number;
}

/** The organisation's OpenID Connect provider, as the Sign-in broker uses it (ADR-004). */
export class IdentityProvider {
  private discovery?: { at: number; value: Discovery };
  private keys?: { at: number; set: JSONWebKeySet };
  private lastUnknownKidFetch = -Infinity;

  constructor(
    private readonly settings: IdpSettings,
    private readonly fetchFn: Fetch,
    private readonly now: () => number,
  ) {}

  get issuer(): string {
    return this.settings.issuer;
  }

  get clientId(): string {
    return this.settings.clientId;
  }

  get scopes(): string {
    return this.settings.scopes;
  }

  private async call(endpoint: Endpoint, url: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await within(CALL_MS, (signal) => this.fetchFn(url, { ...init, signal }));
    } catch {
      op("idp_unreachable", { issuer: this.settings.issuer, endpoint, ms: CALL_MS });
      throw new IdpUnreachable(endpoint);
    }
  }

  async config(): Promise<Discovery> {
    if (this.discovery && this.now() - this.discovery.at < CACHE_MS) return this.discovery.value;
    const res = await this.call("discovery", `${this.settings.issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`);
    const doc = res.ok ? ((await res.json().catch(() => null)) as Partial<Discovery> | null) : null;
    if (!doc || typeof doc.authorization_endpoint !== "string" || typeof doc.token_endpoint !== "string" || typeof doc.jwks_uri !== "string") {
      op("idp_unreachable", { issuer: this.settings.issuer, endpoint: "discovery", ms: CALL_MS });
      throw new IdpUnreachable("discovery");
    }
    const value = { authorization_endpoint: doc.authorization_endpoint, token_endpoint: doc.token_endpoint, jwks_uri: doc.jwks_uri };
    this.discovery = { at: this.now(), value };
    return value;
  }

  private async fetchKeys(): Promise<JSONWebKeySet> {
    const { jwks_uri } = await this.config();
    const res = await this.call("jwks", jwks_uri);
    const set = res.ok ? ((await res.json().catch(() => null)) as JSONWebKeySet | null) : null;
    if (!set || !Array.isArray(set.keys)) {
      op("idp_unreachable", { issuer: this.settings.issuer, endpoint: "jwks", ms: CALL_MS });
      throw new IdpUnreachable("jwks");
    }
    this.keys = { at: this.now(), set };
    return set;
  }

  private async keySet(kid: string | undefined): Promise<JSONWebKeySet> {
    let set = this.keys && this.now() - this.keys.at < CACHE_MS ? this.keys.set : await this.fetchKeys();
    if (kid && !set.keys.some((k) => k.kid === kid) && this.now() - this.lastUnknownKidFetch >= UNKNOWN_KID_GAP_MS) {
      this.lastUnknownKidFetch = this.now();
      set = await this.fetchKeys();
    }
    return set;
  }

  /** Verifies an ID token's signature, issuer, audience, expiry and, at sign-in, nonce. */
  async verifyIdToken(token: string | undefined, expected: { nonce?: string } = {}): Promise<IdTokenClaims> {
    if (!token) throw new IdTokenInvalid();
    let header;
    try {
      header = decodeProtectedHeader(token);
    } catch {
      throw new IdTokenInvalid();
    }
    if (!header.alg || !ALGORITHMS.includes(header.alg)) throw new IdTokenInvalid();
    const set = await this.keySet(header.kid);
    let payload;
    try {
      ({ payload } = await jwtVerify(token, createLocalJWKSet(set), {
        issuer: this.settings.issuer,
        audience: this.settings.clientId,
        algorithms: ALGORITHMS,
        currentDate: new Date(this.now()),
        clockTolerance: SKEW_S,
        requiredClaims: ["sub", "exp"],
      }));
    } catch {
      throw new IdTokenInvalid();
    }
    if (expected.nonce !== undefined && payload.nonce !== expected.nonce) throw new IdTokenInvalid();
    const name = [payload.name, payload.preferred_username, payload.email].find((v): v is string => typeof v === "string" && v !== "");
    return { sub: payload.sub!, name: name ?? payload.sub!, exp: payload.exp! };
  }

  exchangeCode(code: string, verifier: string, redirectUri: string): Promise<ProviderTokens> {
    return this.tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri });
  }

  refresh(refreshToken: string): Promise<ProviderTokens> {
    return this.tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  private async tokenRequest(form: Record<string, string>): Promise<ProviderTokens> {
    const { token_endpoint } = await this.config();
    const body = new URLSearchParams({ ...form, client_id: this.settings.clientId, client_secret: this.settings.clientSecret });
    const res = await this.call("token", token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
    });
    const json = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    if (!res.ok) throw new IdpRefused(typeof json.error === "string" ? json.error : "unknown_error");
    return {
      idToken: typeof json.id_token === "string" ? json.id_token : undefined,
      refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
      refreshExpiresIn: typeof json.refresh_token_expires_in === "number" ? json.refresh_token_expires_in : undefined,
    };
  }
}
