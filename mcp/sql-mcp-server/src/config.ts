import { base64url } from "jose";

/** The runtime's environment: Wrangler vars and secrets, or process.env on a container (environments.md). */
export type RuntimeVariables = Record<string, unknown>;

export interface IdentityProviderSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
}

export interface Config {
  secret: string;
  previousSecret?: string;
  /** Unset until all three IDP_* variables are; Sign-in stays off until then (D-017). */
  identityProvider?: IdentityProviderSettings;
  publicUrl?: string;
}

export type ConfigResult = { ok: true; config: Config } | { ok: false; variable: string };

export const GOOGLE_ISSUER = "https://accounts.google.com";

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

  return { ok: true, config: { secret, previousSecret, identityProvider, publicUrl: publicUrl?.replace(/\/+$/, "") } };
}
