import { describe, expect, it } from "vitest";
import { queryDescription } from "../../src/tools/query.js";
import { callMcp, captureConsole, harness, signIn } from "../signin/helpers.js";
import { queryDatabase } from "./catalog.js";
import { nodeQueryEngine } from "./node-parser.js";
import { ASK, auditLines, callQuery, opLinesOf, resultOf, signedIn } from "./mcp-helpers.js";

const OBJECT_NAMES = ["sales", "orders", "customers", "kinds", "items", "shapes", "payroll", "salary", "email", "region"];

async function toolsOf(env: Record<string, string> = {}, db = queryDatabase()) {
  const { h, token } = await signedIn(db, env);
  return ((await (await callMcp(h, token)).json()) as { result: { tools: { name: string; description: string }[] } }).result.tools;
}

describe("the query tool", () => {
  it("tools_list_has_query_and_list_tables", async () => {
    for (const tier of ["read-only", "read-write", "read-write-delete", "full"]) {
      const tools = await toolsOf({ PERMISSION_TIER: tier });
      expect(tools.map((t) => t.name)).toEqual(["list_tables", "query"]);
      for (const t of tools) for (const name of OBJECT_NAMES) expect(t.description.toLowerCase(), `${t.name}: ${name}`).not.toContain(name);
    }
  });

  it("query_description_static_with_row_limit", async () => {
    const description = (tools: { name: string; description: string }[]) => tools.find((t) => t.name === "query")!.description;
    expect(description(await toolsOf())).toBe(queryDescription(500));
    expect(description(await toolsOf({ ROW_LIMIT: "37" }))).toBe(queryDescription(37));
    expect(queryDescription(37)).toContain("at most 37 rows");
    // The same text whatever the Database holds.
    expect(description(await toolsOf({}, queryDatabase({ email: false })))).toBe(queryDescription(500));
  });

  it("query_requires_request_text_and_sql", async () => {
    const db = queryDatabase();
    const { h, token } = await signedIn(db);
    const sql = "SELECT o.id FROM sales.orders o";
    const bad: Record<string, unknown>[] = [
      { sql },
      { request_text: "", sql },
      { request_text: "x".repeat(4001), sql },
      { request_text: 7, sql },
      { request_text: ASK },
      { request_text: ASK, sql: "" },
      { request_text: ASK, sql: 42 },
    ];
    for (const args of bad) {
      const lines = await captureConsole(async () => {
        const r = await resultOf(await callQuery(h, token, args));
        expect(r.isError).toBe(true);
        expect(r.content[0]!.text).toMatch(/^The request was not accepted: (request_text must be 1–4,000 characters|sql must be a non-empty string)\. \(reference [0-9a-f-]{36}\)$/);
      });
      const audit = auditLines(lines);
      expect(audit, JSON.stringify(args).slice(0, 60)).toHaveLength(1);
      expect(audit[0]!.outcome).toMatchObject({ kind: "refusal", reason_class: "invalid_input" });
      expect(audit[0]!.tool).toBe("query");
    }
    expect(db.catalogReads).toBe(0);
    expect(db.queries).toHaveLength(0);
    const ok = await resultOf(await callQuery(h, token, { request_text: "x".repeat(4000), sql }));
    expect(ok.isError).toBeFalsy();
    expect(db.queries).toHaveLength(1);
  });

  it("query_unsafe_account_answers_503_with_audit", async () => {
    const db = queryDatabase();
    const { h, token } = await signedIn(db);
    db.flags.superuser = true;
    const lines = await captureConsole(async () => {
      const res = await callQuery(h, token, { request_text: ASK, sql: "SELECT o.id FROM sales.orders o" });
      expect(res.status).toBe(503);
      expect(await res.text()).toMatch(/^Deployment misconfigured: Database account bypasses grants \(reference [0-9a-f-]{36}\)$/);
    });
    expect(opLinesOf(lines).filter((l) => l.event === "config_invalid")).toEqual([expect.objectContaining({ variable: "HYPERDRIVE" })]);
    const audit = auditLines(lines);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ tool: "query", outcome: { kind: "refusal", reason_class: "unsafe_account" } });
    expect(db.queries).toHaveLength(0);
  });

  it("query_engine_load_retried_after_failure", async () => {
    let attempts = 0;
    const flaky = async () => {
      attempts++;
      if (attempts === 1) throw new Error("WebAssembly failed to instantiate at /internal/path");
      return nodeQueryEngine();
    };
    const db = queryDatabase();
    const h = await harness({}, { realMcp: true, database: db, queryEngine: flaky });
    const token = (await signIn(h)).access_token;
    const sql = "SELECT o.id FROM sales.orders o WHERE o.id = 7";
    const lines = await captureConsole(async () => {
      const r = await resultOf(await callQuery(h, token, { request_text: ASK, sql }));
      expect(r.content[0]!.text).toMatch(/^The database could not complete this\. \(reference [0-9a-f-]{36}\)$/);
    });
    // The failed Tool call still leaves its Audit record, and a Server fault line that names no detail.
    const audit = auditLines(lines);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ tool: "query", submitted_sql: `<unparsed: ${sql.length} chars>`, outcome: { kind: "database_error", reason_class: "other" } });
    expect(opLinesOf(lines)).toContainEqual(expect.objectContaining({ event: "server_fault" }));
    expect(lines.join("\n")).not.toContain("/internal/path");
    // The failed load is not kept: the next call loads the engine again, and runs.
    const again = await resultOf(await callQuery(h, token, { request_text: ASK, sql }));
    expect(again.isError).toBeFalsy();
    expect(attempts).toBe(2);
  });

  it("query_refusals_never_echo_names", async () => {
    const db = queryDatabase();
    const { h, token } = await signedIn(db);
    const refused: [string, string[]][] = [
      ["SELECT p.salary FROM hr.payroll p", ["payroll", "salary", "hr"]],
      ["SELECT c.email FROM sales.customers c", ["email", "customers"]],
      ["SELECT n.zzz FROM sales.nosuch_zzz n", ["nosuch_zzz", "zzz"]],
      ["SELECT secret_col FROM sales.orders o", ["secret_col", "orders"]],
      ["SELECT i.r FROM sales.items i", ["items"]],
      ["SELECT s.row_to_json FROM (SELECT o.id FROM sales.orders o) s", ["row_to_json"]],
      ["SELECT public.lookup_zzz(1)", ["lookup_zzz", "public"]],
      ["SELECT * FROM sales.customers", ["customers"]],
      ["DELETE FROM sales.orders", ["orders", "delete"]],
    ];
    for (const [sql, names] of refused) {
      const r = await resultOf(await callQuery(h, token, { request_text: ASK, sql }));
      expect(r.isError, sql).toBe(true);
      for (const name of names) expect(r.content[0]!.text.toLowerCase(), `${sql}: ${name}`).not.toContain(name);
    }
    expect(db.queries).toHaveLength(0);
  });
});
