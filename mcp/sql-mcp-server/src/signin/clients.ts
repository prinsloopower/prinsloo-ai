import { op } from "../oplog.js";
import type { Tokens } from "./tokens.js";
import { randomToken, readLimited, TimedOut, within, type Fetch } from "./util.js";

/** Client ID Metadata Document fetch limits (security.md). */
const DOCUMENT_MS = 3000;
const DOCUMENT_BYTES = 16 * 1024;
const MAX_REDIRECT_URIS = 5;
const MAX_CLIENT_NAME = 100;

/** An AI tool as the Sign-in broker knows it: by registration or by metadata document. */
export interface Client {
  clientId: string;
  redirectUris: string[];
  name: string;
}

/** Redirect URIs an AI tool may register: https, or http to the loopback host only. */
export function validRedirectUris(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_REDIRECT_URIS) return null;
  for (const v of value) {
    if (typeof v !== "string") return null;
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      return null;
    }
    if (u.hash) return null;
    const loopback = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
    if (u.protocol !== "https:" && !loopback) return null;
  }
  return value as string[];
}

/** A client_id that is a URL is a metadata document; it may be fetched only if it is safe to (security.md). */
function documentUrl(clientId: string): URL | null {
  let u: URL;
  try {
    u = new URL(clientId);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.port !== "") return null;
  if (u.pathname === "/" || clientId.includes("?") || clientId.includes("#") || u.username || u.password) return null;
  // A trailing dot names the same host ("localhost." is localhost).
  const host = u.hostname.replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return null;
  return u;
}

function looksLikeUrl(clientId: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(clientId);
}

async function fromDocument(clientId: string, fetchFn: Fetch): Promise<Client | null> {
  const url = documentUrl(clientId);
  if (!url) return null;
  const fail = (reason: string) => {
    op("cimd_fetch_failed", { host: url.hostname, reason });
    return null;
  };
  try {
    return await within(DOCUMENT_MS, async (signal) => {
      const res = await fetchFn(clientId, { redirect: "manual", signal, headers: { accept: "application/json" } });
      if (res.status >= 300 && res.status < 400) return fail("redirect");
      if (!res.ok) return fail("status");
      const type = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
      if (type !== "application/json") return fail("content_type");
      const text = await readLimited(res, DOCUMENT_BYTES);
      if (text === null) return fail("size");
      let doc: Record<string, unknown>;
      try {
        doc = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return fail("invalid_document");
      }
      if (doc.client_id !== clientId) return fail("client_id_mismatch");
      const redirectUris = validRedirectUris(doc.redirect_uris);
      if (!redirectUris) return fail("invalid_document");
      const name = typeof doc.client_name === "string" ? doc.client_name.slice(0, MAX_CLIENT_NAME) : url.hostname;
      return { clientId, redirectUris, name };
    });
  } catch (e) {
    // "status" is kept for a host that answered with an error; no answer at all is "network".
    return fail(e instanceof TimedOut ? "timeout" : "network");
  }
}

/** The client behind a client_id, or null if it is unknown, altered or its document is unusable. */
export async function lookupClient(clientId: string, tokens: Tokens, fetchFn: Fetch): Promise<Client | null> {
  if (!clientId) return null;
  if (looksLikeUrl(clientId)) return fromDocument(clientId, fetchFn);
  const reg = await tokens.open("client", clientId);
  const redirectUris = reg && validRedirectUris(reg.redirect_uris);
  if (!reg || !redirectUris) return null;
  return { clientId, redirectUris, name: typeof reg.client_name === "string" ? reg.client_name : "" };
}

export type Registration = { status: 201; body: Record<string, unknown> } | { status: 400; body: { error: string } };

/** Stateless dynamic registration: the client_id is the signed registration itself (ADR-004). */
export async function registerClient(input: unknown, tokens: Tokens, nowSeconds: number): Promise<Registration> {
  if (!input || typeof input !== "object") return { status: 400, body: { error: "invalid_client_metadata" } };
  const meta = input as Record<string, unknown>;
  const redirectUris = validRedirectUris(meta.redirect_uris);
  if (!redirectUris) return { status: 400, body: { error: "invalid_redirect_uri" } };
  const name = meta.client_name ?? "";
  if (typeof name !== "string" || name.length > MAX_CLIENT_NAME) return { status: 400, body: { error: "invalid_client_metadata" } };
  // jti keeps two identical registrations in the same second from sharing a client_id (D-070).
  const clientId = await tokens.issue("client", { v: 1, redirect_uris: redirectUris, client_name: name, iat: nowSeconds, jti: randomToken(16) });
  return {
    status: 201,
    body: {
      client_id: clientId,
      client_id_issued_at: nowSeconds,
      redirect_uris: redirectUris,
      client_name: name,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  };
}
