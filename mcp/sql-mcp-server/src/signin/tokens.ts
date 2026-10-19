import { base64url, CompactEncrypt, compactDecrypt, CompactSign, compactVerify } from "jose";

export type TokenKind = "signin" | "refresh" | "authreq" | "code" | "client";
export type TokenPayload = Record<string, unknown>;

/** The format version this release issues and reads (data-model.md). */
const VERSION = 1;
const ENCRYPTED: readonly TokenKind[] = ["signin", "refresh", "authreq", "code"];

interface Keys {
  enc: Uint8Array;
  sig: Uint8Array;
}

async function derive(secret: string, label: string): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey("raw", base64url.decode(secret), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode(label) },
    ikm,
    256,
  );
  return new Uint8Array(bits);
}

async function keysFor(secret: string): Promise<Keys> {
  return { enc: await derive(secret, "enc"), sig: await derive(secret, "sig") };
}

/**
 * Issues and opens the Server's self-contained values (data-model.md). Each
 * carries its kind in the protected header, so one kind never passes as
 * another (D-070). Issues under SERVER_SECRET only; also opens under
 * SERVER_SECRET_PREVIOUS while a rotation is under way.
 */
export class Tokens {
  private constructor(
    private readonly current: Keys,
    private readonly previous?: Keys,
  ) {}

  static async create(secret: string, previous?: string): Promise<Tokens> {
    return new Tokens(await keysFor(secret), previous ? await keysFor(previous) : undefined);
  }

  async issue(kind: TokenKind, payload: TokenPayload): Promise<string> {
    const body = new TextEncoder().encode(JSON.stringify(payload));
    const typ = `sqlmcp-${kind}`;
    if (ENCRYPTED.includes(kind)) {
      return new CompactEncrypt(body).setProtectedHeader({ alg: "dir", enc: "A256GCM", typ }).encrypt(this.current.enc);
    }
    return new CompactSign(body).setProtectedHeader({ alg: "HS256", typ }).sign(this.current.sig);
  }

  /** The payload, or null for anything forged, altered, of another kind or of an unknown version. */
  async open(kind: TokenKind, token: string): Promise<TokenPayload | null> {
    for (const keys of [this.current, this.previous]) {
      if (!keys) continue;
      const payload = await this.openWith(kind, token, keys);
      if (payload) return payload;
    }
    return null;
  }

  private async openWith(kind: TokenKind, token: string, keys: Keys): Promise<TokenPayload | null> {
    try {
      const { protectedHeader, body } = ENCRYPTED.includes(kind)
        ? await compactDecrypt(token, keys.enc, { keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"] }).then(
            (r) => ({ protectedHeader: r.protectedHeader, body: r.plaintext }),
          )
        : await compactVerify(token, keys.sig, { algorithms: ["HS256"] }).then((r) => ({ protectedHeader: r.protectedHeader, body: r.payload }));
      if (protectedHeader.typ !== `sqlmcp-${kind}`) return null;
      const payload = JSON.parse(new TextDecoder().decode(body)) as TokenPayload;
      return payload.v === VERSION ? payload : null;
    } catch {
      return null;
    }
  }
}
