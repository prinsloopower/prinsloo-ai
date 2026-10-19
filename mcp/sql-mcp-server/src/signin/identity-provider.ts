import { createLocalJWKSet, decodeProtectedHeader, jwtVerify, type JSONWebKeySet } from "jose";
import type { IdentityProviderSettings } from "../config.js";
import { op } from "../oplog.js";
import { SKEW_S, within, type Fetch } from "./util.js";

/** Every Identity provider call, body included, gives up after this long (security.md). */
const CALL_MS = 5000;
/** Discovery and keys are kept this long per isolate or process. */
const CACHE_MS = 10 * 60 * 1000;
/** An unknown key ID refetches the keys at most this often. */
const UNKNOWN_KID_GAP_MS = 60 * 1000;
const ALGORITHMS = ["RS256", "PS256", "ES256"];

type Endpoint = "discovery" | "jwks" | "token";

/** The provider did not answer in time, or could not be reached at all. */
export class IdentityProviderUnreachable extends Error {
  constructor(readonly endpoint: Endpoint) {
    super(`Identity provider ${endpoint} did not answer`);
  }
}

/** The provider answered with an OAuth error. */
export class IdentityProviderRefused extends Error {
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

interface Answer {
  ok: boolean;
  json: Record<string, unknown> | null;
}

/** The organisation's OpenID Connect provider, as the Sign-in broker uses it (ADR-004). */
export class IdentityProvider {
  private cachedDiscovery?: { at: number; value: Discovery };
  private keys?: { at: number; set: JSONWebKeySet };
  private lastUnknownKidFetch = -Infinity;

  constructor(
    private readonly settings: IdentityProviderSettings,
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

  /** One call, response and body both within the time limit; a body that is not JSON reads as null. */
  private async call(endpoint: Endpoint, url: string, init: RequestInit = {}): Promise<Answer> {
    try {
      return await within(CALL_MS, async (signal) => {
        const res = await this.fetchFn(url, { ...init, signal });
        const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        return { ok: res.ok, json };
      });
    } catch {
      op("idp_unreachable", { issuer: this.settings.issuer, endpoint, ms: CALL_MS });
      throw new IdentityProviderUnreachable(endpoint);
    }
  }

  /** The provider answered, but not with what OpenID Connect promises. */
  private invalid(endpoint: Endpoint): IdentityProviderUnreachable {
    op("idp_invalid_response", { issuer: this.settings.issuer, endpoint });
    return new IdentityProviderUnreachable(endpoint);
  }

  async discovery(): Promise<Discovery> {
    if (this.cachedDiscovery && this.now() - this.cachedDiscovery.at < CACHE_MS) return this.cachedDiscovery.value;
    const { ok, json } = await this.call("discovery", `${this.settings.issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`);
    if (!ok || !json || typeof json.authorization_endpoint !== "string" || typeof json.token_endpoint !== "string" || typeof json.jwks_uri !== "string") {
      throw this.invalid("discovery");
    }
    const value = { authorization_endpoint: json.authorization_endpoint, token_endpoint: json.token_endpoint, jwks_uri: json.jwks_uri };
    this.cachedDiscovery = { at: this.now(), value };
    return value;
  }

  private async fetchKeys(): Promise<JSONWebKeySet> {
    const { jwks_uri } = await this.discovery();
    const { ok, json } = await this.call("jwks", jwks_uri);
    if (!ok || !json || !Array.isArray(json.keys)) throw this.invalid("jwks");
    const set = json as unknown as JSONWebKeySet;
    this.keys = { at: this.now(), set };
    return set;
  }

  private async keySet(kid: string | undefined): Promise<JSONWebKeySet> {
    const fresh = !this.keys || this.now() - this.keys.at >= CACHE_MS;
    let set = fresh ? await this.fetchKeys() : this.keys!.set;
    // A key ID we have never seen may mean the provider rotated its keys; look again, but at most once a minute.
    if (!fresh && kid && !set.keys.some((k) => k.kid === kid) && this.now() - this.lastUnknownKidFetch >= UNKNOWN_KID_GAP_MS) {
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
    const { token_endpoint } = await this.discovery();
    const body = new URLSearchParams({ ...form, client_id: this.settings.clientId, client_secret: this.settings.clientSecret });
    const { ok, json } = await this.call("token", token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
    });
    const answer = json ?? {};
    if (!ok) throw new IdentityProviderRefused(typeof answer.error === "string" ? answer.error : "unknown_error");
    return {
      idToken: typeof answer.id_token === "string" ? answer.id_token : undefined,
      refreshToken: typeof answer.refresh_token === "string" ? answer.refresh_token : undefined,
      refreshExpiresIn: typeof answer.refresh_token_expires_in === "number" ? answer.refresh_token_expires_in : undefined,
    };
  }
}
