import type { RefusalClass } from "../audit.js";
import type { Database, QueryEngine, ReasonClass, RefusalCase } from "../engine/database.js";
import type { VisibleObjects } from "../visibility.js";
import { answerDatabaseError, answerRefusal, isRequestText, REQUEST_TEXT_REFUSAL, type ToolAnswer } from "./answer.js";

export const QUERY = "query";

/** Static apart from the Row limit: names no Object, so the tool list can never reveal one. */
export function queryDescription(rowLimit: number): string {
  return (
    `Runs one read-only SELECT you write over the tables list_tables shows, and returns at most ${rowLimit} rows. ` +
    "Qualify every table with its schema and every column with its table or alias. Only built-in functions are supported. " +
    "Pass request_text: the Staff member's question in their own words."
  );
}

/** One sentence for every plan-layer failure, so none tells an ungranted column from a missing one. */
const PLAN_SENTENCE = "The query was not accepted: the database could not plan it. Check its names and types against list_tables, and its constant values.";

/** The Refusal classes and sentences for Agent-written queries, for one Engine; none names anything from the query. */
export function queryRefusals(engine: string): Record<RefusalCase | "plan" | "plan_unaccounted", { reasonClass: RefusalClass; sentence: string }> {
  return {
    too_long: { reasonClass: "query_check", sentence: "The query was not accepted: it is longer than 64 KiB." },
    not_parsed: { reasonClass: "query_check", sentence: `The query was not accepted: it is not valid ${engine}.` },
    not_select: { reasonClass: "query_check", sentence: "The query was not accepted: it must be exactly one SELECT, which only reads." },
    unsupported: { reasonClass: "query_check", sentence: "The query was not accepted: it uses a clause, function, operator or type that is not supported here." },
    unqualified: { reasonClass: "query_check", sentence: "The query was not accepted: qualify every table with its schema and every column with its table or alias." },
    star: { reasonClass: "query_check", sentence: "The query was not accepted: name the columns instead of using *, because not every column of that table can be read." },
    unreadable_type: { reasonClass: "query_check", sentence: "The query was not accepted: it reads a column of a type that queries cannot read." },
    unnamed_output: {
      reasonClass: "query_check",
      sentence: "The query was not accepted: name every subquery and CTE column you use with AS, and refer to it by that name.",
    },
    hidden: {
      reasonClass: "hidden_object",
      sentence: "The query was not accepted: it reads a table or column that is not available to you. Use list_tables to see what you may query.",
    },
    plan: { reasonClass: "query_check", sentence: PLAN_SENTENCE },
    plan_unaccounted: { reasonClass: "hidden_object", sentence: PLAN_SENTENCE },
  };
}

export type ValidatedQuery = { ok: true; requestText: string; sql: string } | { ok: false; sentence: string };

/** Checked by the tool itself, not the SDK, so a bad value is still a Tool call with an Audit record. */
export function validateQuery(args: Record<string, unknown>): ValidatedQuery {
  const { request_text: requestText, sql } = args;
  if (!isRequestText(requestText)) return { ok: false, sentence: REQUEST_TEXT_REFUSAL };
  if (typeof sql !== "string" || sql.length === 0) return { ok: false, sentence: "The request was not accepted: sql must be a non-empty string." };
  return { ok: true, requestText, sql };
}

export interface QueryContext {
  queryEngine: QueryEngine;
  database: Database;
  visible: VisibleObjects;
  rowLimit: number;
  classify: (error: unknown) => ReasonClass;
  /** The Tool call's Audit record id, the reference every Refusal and error carries. */
  id: string;
}

/** The notice for a Cut-short result, which AI tools that show only text still carry. */
export const cutShortNotice = (rowLimit: number) => `The result was cut short at the Row limit of ${rowLimit} rows; more rows match.`;

/**
 * One Agent-written query: the Query check's size and structural steps, then the Engine's plan and
 * execution layers. A query refused at any layer is never sent, and is kept as the submitted SQL;
 * one that was sent is kept as the Tool call's Statement, even when the Database failed it.
 */
export async function answerQuery(sql: string, ctx: QueryContext): Promise<ToolAnswer> {
  const refusals = queryRefusals(ctx.queryEngine.name);
  const refuse = (r: { reasonClass: RefusalClass; sentence: string }): ToolAnswer => ({ ...answerRefusal(r.reasonClass, r.sentence, ctx.id), submittedSql: sql });
  const checked = ctx.queryEngine.checkStructure(sql, ctx.visible);
  if (!checked.ok) return refuse(refusals[checked.refusal]);
  const outcome = await ctx.database.query(sql, checked.tables, ctx.rowLimit);
  if (outcome.kind === "plan_refused") return refuse(refusals[outcome.unaccounted ? "plan_unaccounted" : "plan"]);
  if (outcome.kind === "error") {
    const answer = answerDatabaseError(ctx.classify(outcome.error), ctx.id);
    return outcome.sent ? { ...answer, statements: [{ sql, rows: 0, ms: outcome.ms }] } : { ...answer, submittedSql: sql };
  }
  const { columns, rows, cutShort, ms } = outcome.run;
  const body = { columns, rows, row_count: rows.length, cut_short: cutShort };
  const text = JSON.stringify(body) + (cutShort ? `\n\n${cutShortNotice(ctx.rowLimit)}` : "");
  return {
    result: { content: [{ type: "text", text }], structuredContent: body },
    outcome: { kind: "ok", row_count: rows.length, cut_short: cutShort },
    statements: [{ sql, rows: rows.length, ms }],
  };
}
