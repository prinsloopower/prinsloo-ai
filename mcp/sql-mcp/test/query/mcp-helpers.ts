import { expect } from "vitest";
import type { Database } from "../../src/engine/database.js";
import { callMcp, harness, signIn, type Harness } from "../signin/helpers.js";
import { nodeQueryEngine } from "./node-parser.js";

export const ASK = "How many orders are there per region?";

export interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
}

/** A signed-in Staff member on a Deployment with a Database and PostgreSQL's half of the Query check. */
export async function signedIn(database: Database, env: Record<string, string | undefined> = {}) {
  const h = await harness(env, { realMcp: true, database, queryEngine: nodeQueryEngine });
  const s = await signIn(h);
  return { h, token: s.access_token };
}

export function callQuery(h: Harness, token: string, args: Record<string, unknown>) {
  return callMcp(h, token, "/mcp", { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "query", arguments: args } });
}

export async function resultOf(res: Response): Promise<ToolResult> {
  expect(res.status).toBe(200);
  return ((await res.json()) as { result: ToolResult }).result;
}

function parsed(lines: string[]) {
  return lines.map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; } });
}

export const auditLines = (lines: string[]) => parsed(lines).filter((l): l is Record<string, unknown> => l?.type === "audit");
export const opLinesOf = (lines: string[]) => parsed(lines).filter((l): l is Record<string, unknown> => l?.type === "op");
