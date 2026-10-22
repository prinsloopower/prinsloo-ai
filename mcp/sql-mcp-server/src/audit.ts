import type { ReasonClass } from "./engine/database.js";
import type { Staff } from "./signin/broker.js";

/** Request text is kept up to this length (data-model.md). */
const REQUEST_TEXT_MAX = 4000;

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
}

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
  console.log(
    JSON.stringify({
      type: "audit",
      v: 1,
      ts: new Date(entry.started).toISOString(),
      id: entry.id,
      deployment: entry.deployment,
      staff: { sub: entry.staff.sub, name: entry.staff.name, iss: entry.staff.iss },
      request_text: requestText,
      tool: entry.tool,
      inputs: entry.inputs,
      conversation_objs: [],
      statements: [],
      outcome: entry.outcome,
      duration_ms: Math.max(0, entry.ended - entry.started),
      shortened,
    }),
  );
}

/** Every message about a refused or failed Tool call names its Audit record (D-080). */
export function withReference(sentence: string, id: string): string {
  return `${sentence} (reference ${id})`;
}
