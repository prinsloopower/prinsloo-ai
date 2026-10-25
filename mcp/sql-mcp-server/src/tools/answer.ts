import { REQUEST_TEXT_MAX, withReference, type Outcome, type RefusalClass, type StatementRecord } from "../audit.js";
import type { ReasonClass } from "../engine/database.js";

/** What every Tool shares: its answer's shape, the Refusal and Database error answers, and the Request text check. */

/** Every Tool takes a Request text (ADR-011); one outside these bounds is refused with this sentence. */
export const REQUEST_TEXT_REFUSAL = "The request was not accepted: request_text must be 1–4,000 characters.";
export const isRequestText = (v: unknown): v is string => typeof v === "string" && v.length >= 1 && v.length <= REQUEST_TEXT_MAX;

/** What a Tool call answers, and the SQL its Audit record keeps, unredacted here. */
export interface ToolAnswer {
  result: { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
  outcome: Outcome;
  /** Every Statement the Tool call sent (data-model.md). */
  statements?: StatementRecord[];
  /** An Agent-written query's SQL when it was not sent: refused, or ended before sending (D-089). */
  submittedSql?: string;
}

/** The Agent's sentence for each Database error class (D-080). */
export const DATABASE_ERROR_SENTENCE: Record<ReasonClass, string> = {
  connection: "The database could not be reached.",
  timeout: "The database stopped the query before it finished.",
  permission: "The database refused this for lack of permission.",
  constraint: "The database refused the change because it breaks a rule on the data.",
  other: "The database could not complete this.",
};

export function answerRefusal(reasonClass: RefusalClass, sentence: string, id: string): ToolAnswer {
  const text = withReference(sentence, id);
  return { result: { content: [{ type: "text", text }], isError: true }, outcome: { kind: "refusal", reason_class: reasonClass, reason: text } };
}

export function answerDatabaseError(reasonClass: ReasonClass, id: string): ToolAnswer {
  const text = withReference(DATABASE_ERROR_SENTENCE[reasonClass], id);
  return { result: { content: [{ type: "text", text }], isError: true }, outcome: { kind: "database_error", reason_class: reasonClass, reason: text } };
}
