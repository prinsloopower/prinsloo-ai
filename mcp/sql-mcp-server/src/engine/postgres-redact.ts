import { unparsedSql } from "../audit.js";
import { ParseError, type PgParser } from "./pg-parser.js";
import { onlySelect, QUERY_MAX_BYTES, utf8Length } from "./postgres-structure.js";

/**
 * Redaction of logged SQL on PostgreSQL (Redaction rule). With Redaction
 * on, comments are removed, and a single SELECT is then logged as `normalize` writes it, each `$n`
 * shown as `?`, provided re-parsing the normalised text finds no literal left. `normalize` keeps
 * literals in some statement types, so any other SQL, and SQL that does not parse or is too long,
 * is logged by its length only.
 */
export function redactSql(sql: string, parser: PgParser, on: boolean): string {
  if (!on) return sql;
  const unparsed = unparsedSql(sql);
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
 * Each placeholder's byte offset, or undefined when a literal value is left. Two kinds of constant
 * are not values, and may stay: a type's whole-number modifiers (`numeric(12,2)`),
 * and an ordinal of `GROUP BY` or the SELECT's own `ORDER BY` that names one of its output columns.
 */
function placeholdersIfLiteralFree(tree: unknown): number[] | undefined {
  const offsets: number[] = [];
  const intOf = (n: unknown): number | undefined => {
    const c = n && typeof n === "object" && "A_Const" in n ? (n as { A_Const: { ival?: { ival?: number } } }).A_Const : undefined;
    return c?.ival ? (c.ival.ival ?? 0) : undefined;
  };
  // How many output columns a SELECT has: a set operation's are its leftmost SELECT's.
  const outputs = (select: Record<string, unknown>): number =>
    Array.isArray(select.targetList) ? select.targetList.length : select.larg ? outputs(select.larg as Record<string, unknown>) : 0;
  const isOrdinal = (n: unknown, count: number) => {
    const i = intOf(n);
    return i !== undefined && i >= 1 && i <= count;
  };
  const visit = (node: unknown, wholeNumbersAllowed: boolean): boolean => {
    if (!node || typeof node !== "object") return true;
    if (Array.isArray(node)) return node.every((n) => visit(n, wholeNumbersAllowed));
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (k === "A_Const") {
        if (!wholeNumbersAllowed || !("ival" in (v as object))) return false;
        continue;
      }
      if (k === "ParamRef") offsets.push((v as { location: number }).location);
      if (k === "typmods") {
        if (!visit(v, true)) return false;
        continue;
      }
      if (k === "groupClause" && Array.isArray(v)) {
        if (!v.every((item) => isOrdinal(item, outputs(obj)) || visit(item, false))) return false;
        continue;
      }
      // Only the SELECT's own ORDER BY takes ordinals; in a window's or an aggregate's, a number is a constant.
      if (k === "sortClause" && Array.isArray(v)) {
        for (const item of v) {
          const sort = (item as { SortBy?: { node?: unknown } }).SortBy;
          if (!sort || !(isOrdinal(sort.node, outputs(obj)) || visit(sort.node, false))) return false;
        }
        continue;
      }
      if (!visit(v, false)) return false;
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
