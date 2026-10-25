import type { ReasonClass } from "./engine/database.js";
import type { Staff } from "./signin/broker.js";

/** Request text is accepted, and kept, up to this length (data-model.md). */
export const REQUEST_TEXT_MAX = 4000;
/** A string input is kept up to this length; schema names are never longer (S-002). */
const INPUT_MAX = 128;

export type Outcome =
  | { kind: "ok"; row_count: number; cut_short: boolean }
  | { kind: "refusal"; reason_class: string; reason: string }
  | { kind: "database_error"; reason_class: ReasonClass; reason: string };

export interface AuditEntry {
  id: string;
  started: number;
  ended: number;
  deployment: string;
  staff: Staff;
  /** As received; anything that is not a string is recorded as null. */
  requestText: unknown;
  tool: string;
  inputs: Record<string, unknown>;
  outcome: Outcome;
  /** The Statement an Agent-written query was sent as, its SQL already redacted when Redaction is on. */
  statement?: { sql: string; rows: number; ms: number };
  /** A refused Agent-written query's SQL, already redacted when Redaction is on. */
  submittedSql?: string;
}

/** An Audit record's line stays within this many bytes (operations.md). */
const LINE_MAX = 64 * 1024;
const CUT = "…[cut]";
const bytes = (s: string) => new TextEncoder().encode(s).length;

/**
 * Writes one Audit record per Tool call to standard output, which the Host log facility keeps
 * (ADR-013). It never holds result rows, tokens or the Allow-list itself (R-011, security.md).
 */
export function writeAudit(entry: AuditEntry): void {
  let requestText = typeof entry.requestText === "string" ? entry.requestText : null;
  let shortened = false;
  if (requestText !== null && requestText.length > REQUEST_TEXT_MAX) {
    requestText = `${requestText.slice(0, REQUEST_TEXT_MAX)}…[cut]`;
    shortened = true;
  }
  // Inputs as received: strings bounded, numbers and booleans as they are, anything else left out.
  const inputs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry.inputs)) {
    if (typeof value === "string") {
      inputs[key] = value.length > INPUT_MAX ? `${value.slice(0, INPUT_MAX)}…[cut]` : value;
      shortened ||= value.length > INPUT_MAX;
    } else if (typeof value === "number" || typeof value === "boolean") {
      inputs[key] = value;
    }
  }
  // The SQL strings, in record order: the Statement's, then the submitted SQL's.
  const sql = [entry.statement?.sql, entry.submittedSql];
  const build = () =>
    JSON.stringify({
      type: "audit",
      v: 1,
      ts: new Date(entry.started).toISOString(),
      id: entry.id,
      deployment: entry.deployment,
      staff: { sub: entry.staff.sub, name: entry.staff.name, iss: entry.staff.iss },
      request_text: requestText,
      tool: entry.tool,
      inputs,
      conversation_objs: [],
      statements: entry.statement ? [{ ...entry.statement, sql: sql[0] }] : [],
      ...(sql[1] === undefined ? {} : { submitted_sql: sql[1] }),
      outcome: entry.outcome,
      duration_ms: Math.max(0, entry.ended - entry.started),
      shortened,
    });
  // Over the line cap, the longest SQL string is cut, again if need be, until the record fits.
  let line = build();
  while (bytes(line) > LINE_MAX) {
    const i = (sql[0]?.length ?? -1) >= (sql[1]?.length ?? -1) ? 0 : 1;
    const longest = sql[i];
    if (longest === undefined || longest.length <= CUT.length) break;
    const body = longest.endsWith(CUT) ? longest.slice(0, -CUT.length) : longest;
    sql[i] = body.slice(0, Math.max(0, body.length - (bytes(line) - LINE_MAX) - CUT.length)) + CUT;
    shortened = true;
    line = build();
  }
  console.log(line);
}

/** Every message about a refused or failed Tool call names its Audit record (D-080). */
export function withReference(sentence: string, id: string): string {
  return `${sentence} (reference ${id})`;
}
