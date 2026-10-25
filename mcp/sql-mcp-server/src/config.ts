import { base64url } from "jose";

/** The runtime's environment: Wrangler vars and secrets, or process.env on a container (environments.md). */
export type RuntimeVariables = Record<string, unknown>;

export interface IdentityProviderSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
}

/** Schemas a Deployment may ever show, and tables never shown; narrows the Allow-list (D-075). */
export interface Boundary {
  schemas?: string[];
  exclude: [string, string][];
}

export interface Config {
  secret: string;
  previousSecret?: string;
  /** Unset until all three IDP_* variables are; Sign-in stays off until then (D-017). */
  identityProvider?: IdentityProviderSettings;
  publicUrl?: string;
  /** Unset excludes nothing: the Database account's grants alone decide (D-075). */
  boundary?: Boundary;
  /** The most rows an Agent-written query returns (R-015); 500 when unset. */
  rowLimit: number;
  /** Whether literals in logged SQL are replaced (R-011); on when unset (D-007). */
  redaction: boolean;
}

export type ConfigResult = { ok: true; config: Config } | { ok: false; variable: string };

export const GOOGLE_ISSUER = "https://accounts.google.com";

/** The Row limit's ceiling (operations.md). */
const ROW_LIMIT_MAX = 10_000;

function value(env: RuntimeVariables, name: string): string | undefined {
  const v = env[name];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function isSecret(v: string): boolean {
  try {
    return base64url.decode(v).length >= 32;
  } catch {
    return false;
  }
}

function isUrl(v: string, protocols: string[]): boolean {
  try {
    return protocols.includes(new URL(v).protocol);
  } catch {
    return false;
  }
}

/** Reads the variables Sign-in needs; on failure names the variable, never its value. */
export function readConfig(env: RuntimeVariables): ConfigResult {
  const secret = value(env, "SERVER_SECRET");
  if (!secret || !isSecret(secret)) return { ok: false, variable: "SERVER_SECRET" };
  const previousSecret = value(env, "SERVER_SECRET_PREVIOUS");
  if (previousSecret && !isSecret(previousSecret)) return { ok: false, variable: "SERVER_SECRET_PREVIOUS" };
  const publicUrl = value(env, "PUBLIC_URL");
  if (publicUrl && !isUrl(publicUrl, ["https:", "http:"])) return { ok: false, variable: "PUBLIC_URL" };

  const boundaryText = value(env, "BOUNDARY");
  const boundary = boundaryText === undefined ? undefined : parseBoundary(boundaryText);
  if (boundary === null) return { ok: false, variable: "BOUNDARY" };

  const rowLimitText = value(env, "ROW_LIMIT") ?? "500";
  const rowLimit = /^\d+$/.test(rowLimitText) ? Number(rowLimitText) : NaN;
  if (!(rowLimit >= 1 && rowLimit <= ROW_LIMIT_MAX)) return { ok: false, variable: "ROW_LIMIT" };
  const redactionText = value(env, "REDACTION") ?? "on";
  if (redactionText !== "on" && redactionText !== "off") return { ok: false, variable: "REDACTION" };

  const issuer = value(env, "IDP_ISSUER");
  if (issuer && !isUrl(issuer, ["https:"])) return { ok: false, variable: "IDP_ISSUER" };
  const clientId = value(env, "IDP_CLIENT_ID");
  const clientSecret = value(env, "IDP_CLIENT_SECRET");
  const identityProvider =
    issuer && clientId && clientSecret
      ? {
          issuer,
          clientId,
          clientSecret,
          // Google issues refresh tokens through access_type=offline, not this scope (D-069).
          scopes: value(env, "IDP_SCOPES") ?? (issuer === GOOGLE_ISSUER ? "openid profile email" : "openid profile email offline_access"),
        }
      : undefined;

  return {
    ok: true,
    config: { secret, previousSecret, identityProvider, publicUrl: publicUrl?.replace(/\/+$/, ""), boundary, rowLimit, redaction: redactionText === "on" },
  };
}

const isName = (v: unknown): v is string => typeof v === "string" && v !== "";

/** `{"schemas":[...],"exclude":[[schema, table], ...]}`, both optional; null when malformed. */
function parseBoundary(text: string): Boundary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const { schemas, exclude } = parsed as Record<string, unknown>;
  if (schemas !== undefined && !(Array.isArray(schemas) && schemas.every(isName))) return null;
  if (exclude !== undefined && !(Array.isArray(exclude) && exclude.every((e) => Array.isArray(e) && e.length === 2 && e.every(isName)))) {
    return null;
  }
  const excluded = (exclude ?? []) as [string, string][];
  return schemas === undefined ? { exclude: excluded } : { schemas: schemas as string[], exclude: excluded };
}
