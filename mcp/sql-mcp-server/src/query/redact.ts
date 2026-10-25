import { ParseError, type PgParser } from "../engine/pg-parser.js";
import { QUERY_MAX_BYTES } from "./check.js";

/**
 * Redaction of logged SQL on PostgreSQL (security.md, Redaction rule; D-082). With Redaction on, a
 * single SELECT is logged as `normalize` writes it, each `$n` shown as `?`, provided re-parsing the
 * normalised text finds no literal left. `normalize` keeps literals in some statement types, so any
 * other SQL, and SQL that does not parse or is too long, is logged by its length only.
 */
export function redactSql(sql: string, parser: PgParser, on: boolean): string {
  if (!on) return sql;
  const unparsed = `<unparsed: ${sql.length} chars>`;
  if (new TextEncoder().encode(sql).length > QUERY_MAX_BYTES) return unparsed;
  try {
    if (!isOneSelect(parser.parse(sql))) return unparsed;
    const normalized = parser.normalize(sql);
    const tree = parser.parse(normalized);
    if (!isOneSelect(tree)) return unparsed;
    const params: number[] = [];
    if (!literalFree(tree, params)) return unparsed;
    return placeholdersAsQuestionMarks(normalized, params);
  } catch (e) {
    if (e instanceof ParseError) return unparsed;
    throw e;
  }
}

function isOneSelect(tree: ReturnType<PgParser["parse"]>): boolean {
  const stmts = tree.stmts ?? [];
  return stmts.length === 1 && Object.keys(stmts[0]!.stmt).join() === "SelectStmt";
}

/** True when no literal value is left; collects each placeholder's byte offset. A type's modifiers are part of the type, not values. */
function literalFree(node: unknown, params: number[], inTypmods = false): boolean {
  if (!node || typeof node !== "object") return true;
  if (Array.isArray(node)) return node.every((n) => literalFree(n, params, inTypmods));
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "A_Const" && !inTypmods) return false;
    if (k === "ParamRef") params.push((v as { location: number }).location);
    if (!literalFree(v, params, inTypmods || k === "typmods")) return false;
  }
  return true;
}

/** Rewrites each `$n` at the parser's byte offsets as `?`, leaving quoted identifiers that contain `$n` alone. */
function placeholdersAsQuestionMarks(normalized: string, offsets: number[]): string {
  const bytes = new TextEncoder().encode(normalized);
  const decode = (b: Uint8Array) => new TextDecoder().decode(b);
  let out = "";
  let at = 0;
  for (const start of [...offsets].sort((a, b) => a - b)) {
    let end = start + 1;
    while (end < bytes.length && bytes[end]! >= 0x30 && bytes[end]! <= 0x39) end++;
    out += decode(bytes.subarray(at, start)) + "?";
    at = end;
  }
  return out + decode(bytes.subarray(at));
}
