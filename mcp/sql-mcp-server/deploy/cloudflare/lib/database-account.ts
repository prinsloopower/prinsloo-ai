import { createHash, createHmac, pbkdf2Sync } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ITERATIONS = 4096;

/**
 * PostgreSQL's stored form of a SCRAM-SHA-256 password, which `CREATE ROLE … PASSWORD` accepts as
 * given. Supabase receives this and never the password (D-106).
 */
export function scramVerifier(password: string, salt: Uint8Array): string {
  const salted = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
  return `SCRAM-SHA-256$${ITERATIONS}:${b64(salt)}$${b64(storedKey)}:${b64(serverKey)}`;
}

/** `database-account.sql` with the role's name and its verifier filled in. */
export function createRoleSql(role: string, verifier: string): string {
  const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "database-account.sql"), "utf8");
  return text.replaceAll("{{role}}", role).replaceAll("{{verifier}}", verifier);
}

export const alterRoleSql = (role: string, verifier: string) => `ALTER ROLE "${role}" PASSWORD '${verifier}';\n`;

export const dropRoleSql = (role: string) => `DROP OWNED BY "${role}";\nDROP ROLE "${role}";\n`;
