import type { Boundary } from "../config.js";
import type { Catalog } from "../engine/database.js";
import { visibleTables, type VisibleTable } from "../visibility.js";
import { isRequestText, REQUEST_TEXT_REFUSAL, type ToolAnswer } from "./answer.js";

export const LIST_TABLES = "list_tables";

/** Static: names no Object, so the tool list can never reveal one (R-003). */
export const LIST_TABLES_DESCRIPTION =
  "Lists the tables and columns you may query in this database. Pass request_text: the Staff member's question in their own words.";

const SCHEMA_MAX = 128;
const TABLES_MAX = 500;

export type Validated = { ok: true; requestText: string; schema?: string } | { ok: false; sentence: string };

/** Checked by the tool itself, not the SDK, so a bad value is still a Tool call with an Audit record (D-078). */
export function validateListTables(args: Record<string, unknown>): Validated {
  const { request_text: requestText, schema } = args;
  if (!isRequestText(requestText)) return { ok: false, sentence: REQUEST_TEXT_REFUSAL };
  if (schema !== undefined && (typeof schema !== "string" || schema.length < 1 || schema.length > SCHEMA_MAX)) {
    return { ok: false, sentence: "The request was not accepted: schema must be 1–128 characters." };
  }
  return schema === undefined ? { ok: true, requestText } : { ok: true, requestText, schema };
}

export interface Listing {
  tables: VisibleTable[];
  complete: boolean;
}

/** The listing for one Tool call: a hidden or missing schema both give an empty list (D-005). */
export function listing(catalog: Catalog, boundary: Boundary | undefined, schema?: string): Listing {
  const all = visibleTables(catalog, boundary).filter((t) => schema === undefined || t.schema === schema);
  return { tables: all.slice(0, TABLES_MAX), complete: all.length <= TABLES_MAX };
}

export function answerListing(l: Listing): ToolAnswer {
  const body = { tables: l.tables, complete: l.complete };
  return {
    result: { content: [{ type: "text", text: JSON.stringify(body) }], structuredContent: body },
    outcome: { kind: "ok", row_count: l.tables.length, cut_short: !l.complete },
  };
}
