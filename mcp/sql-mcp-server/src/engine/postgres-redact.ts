import { ParseError, type PgParser } from "./pg-parser.js";
import { onlySelect, QUERY_MAX_BYTES, utf8Length } from "./postgres-structure.js";

/**
 * Redaction of logged SQL on PostgreSQL (security.md, Redaction rule; D-082, D-087). With Redaction
 * on, comments are removed, and a single SELECT is then logged as `normalize` writes it, each `$n`
 * shown as `?`, provided re-parsing the normalised text finds no literal left. `normalize` keeps
 * literals in some statement types, so any other SQL, and SQL that does not parse or is too long,
 * is logged by its length only.
 */
export function redactSql(sql: string, parser: PgParser, on: boolean): string {
  if (!on) return sql;
  const unparsed = `<unparsed: ${sql.length} chars>`;
  if (utf8Length(sql) > QUERY_MAX_BYTES) return unparsed;
  try {
    // Comments can carry values as literals do, and `normalize` keeps them.
    const bare = withoutComments(sql, parser);
    if (!onlySelect(parser.parse(bare))) return unparsed;
    const normalized = parser.normalize(bare);
    const tree = parser.parse(normalized);
    if (!onlySelect(tree)) return unparsed;
    const placeholders = placeholdersIfLiteralFree(tree);
    return placeholders ? placeholdersAsQuestionMarks(normalized, placeholders) : unparsed;
  } catch (e) {
    if (e instanceof ParseError) return unparsed;
    throw e;
  }
}

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

/** The SQL with each comment the lexer finds replaced by one space, so the tokens either side stay apart. */
function withoutComments(sql: string, parser: PgParser): string {
  const comments = parser.scan(sql).filter((t) => t.tokenName === "SQL_COMMENT" || t.tokenName === "C_COMMENT");
  if (!comments.length) return sql;
  const bytes = new TextEncoder().encode(sql);
  let out = "";
  let at = 0;
  for (const c of comments) {
    out += decode(bytes.subarray(at, c.start)) + " ";
    at = c.end;
  }
  return out + decode(bytes.subarray(at));
}

/**
 * Each placeholder's byte offset, or undefined when a literal value is left. A type's modifiers
 * (`numeric(12,2)`) are part of the type, not values.
 */
function placeholdersIfLiteralFree(tree: unknown): number[] | undefined {
  const offsets: number[] = [];
  const visit = (node: unknown, inTypmods: boolean): boolean => {
    if (!node || typeof node !== "object") return true;
    if (Array.isArray(node)) return node.every((n) => visit(n, inTypmods));
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "A_Const" && !inTypmods) return false;
      if (k === "ParamRef") offsets.push((v as { location: number }).location);
      if (!visit(v, inTypmods || k === "typmods")) return false;
    }
    return true;
  };
  return visit(tree, false) ? offsets : undefined;
}

/** Rewrites each `$n` at the parser's byte offsets as `?`, leaving quoted identifiers that contain `$n` alone. */
function placeholdersAsQuestionMarks(normalized: string, offsets: number[]): string {
  const bytes = new TextEncoder().encode(normalized);
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
