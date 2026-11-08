import { readFileSync } from "node:fs";

/**
 * The MS SQL Server read-only list as security.md states it, read from the document itself so the
 * tests follow an amendment and never keep a second copy.
 */
function ownershipCatalogs(): { database: string[]; server: string[] } {
  const text = readFileSync("docs/system-spec/security.md", "utf8");
  const views = (line: string | undefined) => [...(line ?? "").matchAll(/`sys\.(\w+)`/g)].map((m) => m[1]!);
  const block = text.slice(text.indexOf("**It owns nothing.**"));
  const lines = block.split("\n");
  return {
    database: views(lines.find((l) => l.trim().startsWith("- in the database:"))),
    server: views(lines.find((l) => l.trim().startsWith("- where the server level can be read:"))),
  };
}

export const OWNERSHIP_CATALOGS = ownershipCatalogs();

/** One permission row as the measurement reads it. */
export interface PermissionRow {
  principal: string;
  class_desc: string;
  permission_name: string;
  state_desc: string;
  major_id: number;
}

/** Whether security.md's list covers a database permission row held by one of the account's principals. */
export function databaseRowCovered(row: PermissionRow): boolean {
  if (row.state_desc === "DENY") return true;
  if (row.class_desc === "DATABASE") {
    return ["CONNECT", "SHOWPLAN", "VIEW ANY COLUMN ENCRYPTION KEY DEFINITION", "VIEW ANY COLUMN MASTER KEY DEFINITION"].includes(row.permission_name);
  }
  if (row.permission_name === "SELECT" && (row.class_desc === "SCHEMA" || row.class_desc === "OBJECT_OR_COLUMN")) return true;
  return row.principal === "public" && row.class_desc === "OBJECT_OR_COLUMN" && row.major_id < 0;
}

/** Whether security.md's list covers a server permission row held by one of the login's principals. */
export function serverRowCovered(row: PermissionRow): boolean {
  if (row.state_desc === "DENY") return true;
  if (row.class_desc === "SERVER") return ["CONNECT SQL", "VIEW ANY DATABASE"].includes(row.permission_name);
  return row.class_desc === "ENDPOINT" && row.permission_name === "CONNECT";
}
