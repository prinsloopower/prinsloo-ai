import { createHash, createHmac, pbkdf2Sync } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ITERATIONS = 4096;

/**
 * PostgreSQL's stored form of a SCRAM-SHA-256 password, which `CREATE ROLE … PASSWORD` accepts as
 * given. Supabase receives this and never the password.
 */
export function scramVerifier(password: string, salt: Uint8Array): string {
  const salted = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
  return `SCRAM-SHA-256$${ITERATIONS}:${b64(salt)}$${b64(storedKey)}:${b64(serverKey)}`;
}

/**
 * The comment setup puts on a role it made, so a later run resets that role and no other.
 * A Worker name is unique only within its Cloudflare account, so the mark names both.
 */
export const roleMark = (worker: string, accountId: string) =>
  `sql-mcp-server: the Database account setup made for the Deployment ${worker} in Cloudflare account ${accountId}`;

/** `database-account.sql`, filled in: create the role, or give a new password to the one setup made for this Deployment. */
export function accountSql(role: string, mark: string, verifier: string): string {
  const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "database-account.sql"), "utf8");
  return text.replaceAll("{{role}}", role).replaceAll("{{mark}}", mark).replaceAll("{{verifier}}", verifier);
}

/** Drops the role only if it carries this Deployment's mark; any other role of that name is left alone. */
export const dropRoleSql = (role: string, mark: string) => `DO $setup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
    RAISE NOTICE 'The role ${role} does not exist, so there is nothing to drop.';
    RETURN;
  END IF;
  IF (SELECT shobj_description(oid, 'pg_authid') FROM pg_roles WHERE rolname = '${role}') IS DISTINCT FROM '${mark}' THEN
    RAISE EXCEPTION 'The role ${role} was not made by setup for this Deployment, so it was not dropped.';
  END IF;
  EXECUTE 'DROP OWNED BY "${role}"';
  EXECUTE 'DROP ROLE "${role}"';
END
$setup$;
`;
