import type { ReasonClass } from "./engine/database.js";
import type { Staff } from "./signin/broker.js";

/** Request text is accepted, and kept, up to this length. */
export const REQUEST_TEXT_MAX = 4000;
/** A string input is kept up to this length; schema names are never longer. */
const INPUT_MAX = 128;

/** A Refusal's class in the Audit record; fixed for both Engines. */
export type RefusalClass = "hidden_object" | "query_check" | "tier" | "boundary" | "invalid_input" | "unsafe_account";

export type Outcome =
  | { kind: "ok"; row_count: number; cut_short: boolean }
  | { kind: "refusal"; reason_class: RefusalClass; reason: string }
  | { kind: "database_error"; reason_class: ReasonClass; reason: string };

/** One Statement a Tool call sent, as its Audit record keeps it. */
export interface StatementRecord {
  /** Already redacted when Redaction is on. */
  sql: string;
  rows: number;
  ms: number;
}

/** What the Audit logger is given for one Tool call; it writes the Audit record from it. */
export interface AuditRecord {
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
  /** Every Statement the Tool call sent; Server statements are not among them. */
  statements?: StatementRecord[];
  /** An Agent-written query's SQL when it was not sent: refused, or ended before sending. Already redacted when Redaction is on. */
  submittedSql?: string;
}

/** Logged SQL that is kept by its length only: what Redaction writes when it cannot vouch for the text. */
export const unparsedSql = (sql: string) => `<unparsed: ${sql.length} chars>`;

/** An Audit record's line stays within this many bytes. */
const LINE_MAX = 64 * 1024;
const CUT = "…[cut]";
const bytes = (s: string) => new TextEncoder().encode(s).length;

/**
 * Writes one Audit record per Tool call to standard output, which the Host log facility keeps
 *. It never holds result rows, tokens or the Allow-list itself.
 */
export function writeAudit(record: AuditRecord): void {
  let requestText = typeof record.requestText === "string" ? record.requestText : null;
  let shortened = false;
  if (requestText !== null && requestText.length > REQUEST_TEXT_MAX) {
    requestText = `${requestText.slice(0, REQUEST_TEXT_MAX)}…[cut]`;
    shortened = true;
  }
  // Inputs as received: strings bounded, numbers and booleans as they are, anything else left out.
  const inputs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record.inputs)) {
    if (typeof value === "string") {
      inputs[key] = value.length > INPUT_MAX ? `${value.slice(0, INPUT_MAX)}…[cut]` : value;
      shortened ||= value.length > INPUT_MAX;
    } else if (typeof value === "number" || typeof value === "boolean") {
      inputs[key] = value;
    }
  }
  const statements = (record.statements ?? []).map((s) => ({ ...s }));
  let submittedSql = record.submittedSql;
  const build = () =>
    JSON.stringify({
      type: "audit",
      v: 1,
      ts: new Date(record.started).toISOString(),
      id: record.id,
      deployment: record.deployment,
      staff: { sub: record.staff.sub, name: record.staff.name, iss: record.staff.iss },
      request_text: requestText,
      tool: record.tool,
      inputs,
      conversation_objs: [],
      statements,
      ...(submittedSql === undefined ? {} : { submitted_sql: submittedSql }),
      outcome: record.outcome,
      duration_ms: Math.max(0, record.ended - record.started),
      shortened,
    });
  // Over the line cap, the longest SQL string is cut, again if need be, until the record fits.
  const sqlStrings = () => [
    ...statements.map((s) => ({ text: s.sql, set: (v: string) => (s.sql = v) })),
    ...(submittedSql === undefined ? [] : [{ text: submittedSql, set: (v: string) => (submittedSql = v) }]),
  ];
  let line = build();
  while (bytes(line) > LINE_MAX) {
    const longest = sqlStrings().sort((a, b) => b.text.length - a.text.length)[0];
    if (!longest || longest.text.length <= CUT.length) break;
    const body = longest.text.endsWith(CUT) ? longest.text.slice(0, -CUT.length) : longest.text;
    longest.set(body.slice(0, Math.max(0, body.length - (bytes(line) - LINE_MAX) - CUT.length)) + CUT);
    shortened = true;
    line = build();
  }
  console.log(line);
}

/** Every message about a refused or failed Tool call names its Audit record. */
export function withReference(sentence: string, id: string): string {
  return `${sentence} (reference ${id})`;
}
