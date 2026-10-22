import { describe, expect, it } from "vitest";
import { readConfig } from "../../src/config.js";
import { classifyPostgresError } from "../../src/engine/postgres.js";
import { visibleTables } from "../../src/visibility.js";
import { callMcp, captureConsole, harness, ISSUER, ORIGIN, SECRET, signIn, type Harness } from "../signin/helpers.js";
import { FakeDatabase, salesDatabase } from "./fake-database.js";

const ASK = "Which tables can I query about sales?";

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
  structuredContent?: { tables: { schema: string; table: string; columns: { name: string; type: string }[]; all_columns: boolean }[]; complete: boolean };
}

async function signedIn(database: FakeDatabase, env: Record<string, string | undefined> = {}) {
  const h = await harness(env, { realMcp: true, database });
  const s = await signIn(h);
  return { h, token: s.access_token };
}

async function listTables(h: Harness, token: string, args: Record<string, unknown>) {
  return callMcp(h, token, "/mcp", { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "list_tables", arguments: args } });
}

async function resultOf(res: Response): Promise<ToolResult> {
  expect(res.status).toBe(200);
  return ((await res.json()) as { result: ToolResult }).result;
}

function auditLines(lines: string[]) {
  return lines.map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; } }).filter((l): l is Record<string, unknown> => l?.type === "audit");
}

function opLinesOf(lines: string[]) {
  return lines.map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; } }).filter((l): l is Record<string, unknown> => l?.type === "op");
}

describe("S-002 listing tables", () => {
  it("boundary_setting_parsed_and_validated", () => {
    const base = { SERVER_SECRET: SECRET };
    const ok = readConfig({ ...base, BOUNDARY: '{"schemas":["sales"],"exclude":[["sales","payroll"]]}' });
    expect(ok.ok && ok.config.boundary).toEqual({ schemas: ["sales"], exclude: [["sales", "payroll"]] });
    const unset = readConfig(base);
    expect(unset.ok && unset.config.boundary).toBeUndefined();
    for (const bad of ["not json", '{"schemas":"sales"}', '{"exclude":[["sales"]]}', '{"schemas":[1]}', "[]"]) {
      expect(readConfig({ ...base, BOUNDARY: bad })).toEqual({ ok: false, variable: "BOUNDARY" });
    }
  });

  it("invalid_boundary_answers_503", async () => {
    const h = await harness({ BOUNDARY: "not json" }, { realMcp: true, database: salesDatabase() });
    const res = await callMcp(h, null);
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("Deployment misconfigured: BOUNDARY");
  });

  it("resolver_applies_boundary", () => {
    const catalog = { flags: salesDatabase().flags, rows: salesDatabase().rows };
    const names = (b?: { schemas?: string[]; exclude: [string, string][] }) => visibleTables(catalog, b).map((t) => `${t.schema}.${t.table}`);
    expect(names()).toEqual(["sales.customers", "sales.orders"]);
    expect(names({ schemas: ["sales"], exclude: [["sales", "orders"]] })).toEqual(["sales.customers"]);
    expect(names({ schemas: ["hr"], exclude: [] })).toEqual([]);
    expect(names({ exclude: [["sales", "customers"]] })).toEqual(["sales.orders"]);
  });

  it("list_tables_registered_alone_with_static_description", async () => {
    for (const tier of ["read-only", "read-write", "read-write-delete", "full"]) {
      const { h, token } = await signedIn(salesDatabase(), { PERMISSION_TIER: tier });
      const res = await callMcp(h, token);
      const tools = ((await res.json()) as { result: { tools: { name: string; description: string }[] } }).result.tools;
      expect(tools.map((t) => t.name)).toEqual(["list_tables"]);
      for (const name of ["sales", "orders", "customers", "payroll", "salary"]) expect(tools[0]!.description.toLowerCase()).not.toContain(name);
    }
  });

  it("list_tables_returns_visible_objects", async () => {
    const { h, token } = await signedIn(salesDatabase());
    const r = await resultOf(await listTables(h, token, { request_text: ASK }));
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toEqual({
      tables: [
        { schema: "sales", table: "customers", columns: [{ name: "id", type: "integer" }, { name: "name", type: "text" }, { name: "region", type: "text" }], all_columns: false },
        { schema: "sales", table: "orders", columns: [{ name: "id", type: "integer" }, { name: "total", type: "numeric" }], all_columns: true },
      ],
      complete: true,
    });
    expect(JSON.parse(r.content[0]!.text)).toEqual(r.structuredContent);
  });

  it("list_tables_schema_filter_never_confirms_hidden", async () => {
    const { h, token } = await signedIn(salesDatabase());
    const hidden = await resultOf(await listTables(h, token, { request_text: ASK, schema: "hr" }));
    const missing = await resultOf(await listTables(h, token, { request_text: ASK, schema: "no_such_schema" }));
    expect(hidden.structuredContent).toEqual({ tables: [], complete: true });
    expect(missing).toEqual(hidden);
    const sales = await resultOf(await listTables(h, token, { request_text: ASK, schema: "sales" }));
    expect(sales.structuredContent?.tables).toHaveLength(2);
  });

  it("list_tables_caps_at_500_tables", async () => {
    const db = new FakeDatabase();
    for (let i = 500; i >= 0; i--) db.table("big", `t${String(i).padStart(3, "0")}`, [["id", "integer"]]);
    db.table("A_upper", "first", [["id", "integer"]]);
    const { h, token } = await signedIn(db);
    const lines = await captureConsole(async () => {
      const r = await resultOf(await listTables(h, token, { request_text: ASK }));
      expect(r.structuredContent?.tables).toHaveLength(500);
      expect(r.structuredContent?.complete).toBe(false);
      expect(r.structuredContent?.tables[0]).toMatchObject({ schema: "A_upper", table: "first" });
      expect(r.structuredContent?.tables[499]).toMatchObject({ schema: "big", table: "t498" });
    });
    expect(auditLines(lines)[0]?.outcome).toMatchObject({ kind: "ok", row_count: 500, cut_short: true });
  });

  it("list_tables_requires_request_text", async () => {
    const db = salesDatabase();
    const { h, token } = await signedIn(db);
    for (const args of [{}, { request_text: "" }, { request_text: "x".repeat(4001) }, { request_text: 42 }]) {
      const lines = await captureConsole(async () => {
        const r = await resultOf(await listTables(h, token, args));
        expect(r.isError).toBe(true);
        expect(r.content[0]!.text).toMatch(/^The request was not accepted: request_text must be 1–4,000 characters\. \(reference [0-9a-f-]{36}\)$/);
      });
      const audit = auditLines(lines);
      expect(audit).toHaveLength(1);
      expect(audit[0]!.outcome).toMatchObject({ kind: "refusal", reason_class: "invalid_input" });
    }
    const long = "y".repeat(4001);
    const cut = auditLines(await captureConsole(async () => { await listTables(h, token, { request_text: long }); }))[0]!;
    expect(cut.request_text).toBe(`${"y".repeat(4000)}…[cut]`);
    expect(cut.shortened).toBe(true);
    const missing = auditLines(await captureConsole(async () => { await listTables(h, token, {}); }))[0]!;
    expect(missing.request_text).toBeNull();
    expect((await resultOf(await listTables(h, token, { request_text: "z".repeat(4000) }))).isError).toBeFalsy();
  });

  it("list_tables_bounds_schema_input", async () => {
    const { h, token } = await signedIn(salesDatabase());
    const tooLong = await resultOf(await listTables(h, token, { request_text: ASK, schema: "s".repeat(129) }));
    expect(tooLong.isError).toBe(true);
    expect(tooLong.content[0]!.text).toMatch(/^The request was not accepted: schema must be 1–128 characters\. \(reference /);
    for (const bad of ["", 7]) expect((await resultOf(await listTables(h, token, { request_text: ASK, schema: bad }))).isError).toBe(true);
    expect((await resultOf(await listTables(h, token, { request_text: ASK, schema: "s".repeat(128) }))).isError).toBeFalsy();
  });

  it("unsafe_account_answers_503_with_audit_and_op_line", async () => {
    for (const flag of ["superuser", "bypassRls", "readAllData", "writeAllData"] as const) {
      const db = salesDatabase();
      const { h, token } = await signedIn(db);
      db.flags[flag] = true;
      const lines = await captureConsole(async () => {
        const res = await listTables(h, token, { request_text: ASK });
        expect(res.status).toBe(503);
        expect(await res.text()).toMatch(/^Deployment misconfigured: Database account bypasses grants \(reference [0-9a-f-]{36}\)$/);
      });
      expect(opLinesOf(lines)).toContainEqual(expect.objectContaining({ event: "config_invalid", variable: "HYPERDRIVE" }));
      const audit = auditLines(lines);
      expect(audit).toHaveLength(1);
      expect(audit[0]!.outcome).toMatchObject({ kind: "refusal", reason_class: "unsafe_account" });
      expect((await h.app.request(`${ORIGIN}/.well-known/oauth-authorization-server`)).status).toBe(200);
    }
  });

  it("healthz_reports_unsafe_account", async () => {
    const db = salesDatabase();
    const h = await harness({}, { database: db });
    expect(await (await h.app.request(`${ORIGIN}/healthz`)).json()).toEqual({ status: "ok", database: "ok" });
    db.flags.readAllData = true;
    const res = await h.app.request(`${ORIGIN}/healthz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", database: "unsafe" });
  });

  it("account_check_only_on_tool_calls_after_input_validation", async () => {
    const db = salesDatabase();
    const { h, token } = await signedIn(db);
    db.flags.superuser = true;
    const init = await callMcp(h, token, "/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
    expect(init.status).toBe(200);
    expect((await callMcp(h, token)).status).toBe(200);
    expect(db.catalogReads).toBe(0);
    const lines = await captureConsole(async () => {
      const r = await resultOf(await listTables(h, token, {}));
      expect(r.isError).toBe(true);
    });
    expect(db.catalogReads).toBe(0);
    expect(auditLines(lines)[0]!.outcome).toMatchObject({ reason_class: "invalid_input" });
  });

  it("audit_record_written_once_per_tool_call", async () => {
    const { h, token } = await signedIn(salesDatabase());
    const lines = await captureConsole(async () => {
      for (let i = 0; i < 3; i++) await listTables(h, token, { request_text: `${ASK} ${i}` });
    });
    const audit = auditLines(lines);
    expect(audit).toHaveLength(3);
    expect(new Set(audit.map((a) => a.id)).size).toBe(3);
  });

  it("audit_record_fields_and_staff_identity", async () => {
    const { h, token } = await signedIn(salesDatabase());
    const lines = await captureConsole(async () => {
      await listTables(h, token, { request_text: ASK, schema: "sales" });
    });
    const a = auditLines(lines)[0]!;
    expect(a).toMatchObject({
      type: "audit",
      v: 1,
      deployment: ORIGIN,
      staff: { sub: "staff-123", name: "Ada Analyst", iss: ISSUER },
      request_text: ASK,
      tool: "list_tables",
      inputs: { schema: "sales" },
      conversation_objs: [],
      statements: [],
      outcome: { kind: "ok", row_count: 2, cut_short: false },
      shortened: false,
    });
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(String(a.ts)))).toBe(false);
    expect(typeof a.duration_ms).toBe("number");
  });

  it("audit_record_never_holds_listing_or_tokens", async () => {
    const { h, token } = await signedIn(salesDatabase());
    const lines = await captureConsole(async () => {
      await listTables(h, token, { request_text: "What can I see?" });
    });
    const record = JSON.stringify(auditLines(lines)[0]);
    for (const name of ["orders", "customers", "region", "total", "numeric"]) expect(record).not.toContain(name);
    expect(lines.join("\n")).not.toContain(token);
  });

  it("no_audit_for_initialize_or_tools_list", async () => {
    const { h, token } = await signedIn(salesDatabase());
    const lines = await captureConsole(async () => {
      await callMcp(h, token, "/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
      await callMcp(h, token);
      await callMcp(h, null, "/mcp", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_tables", arguments: { request_text: ASK } } });
    });
    expect(auditLines(lines)).toEqual([]);
  });

  it("no_audit_for_misconfigured_deployment", async () => {
    const lines = await captureConsole(async () => {
      const h = await harness({ BOUNDARY: "{bad" }, { realMcp: true, database: salesDatabase() });
      await callMcp(h, "anything", "/mcp", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_tables", arguments: { request_text: ASK } } });
    });
    expect(auditLines(lines)).toEqual([]);
    expect(opLinesOf(lines)).toContainEqual(expect.objectContaining({ event: "config_invalid", variable: "BOUNDARY" }));
  });

  it("database_error_rebuilt_from_class_without_names", async () => {
    expect(classifyPostgresError(Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }))).toBe("connection");
    expect(classifyPostgresError(Object.assign(new Error("x"), { code: "08006" }))).toBe("connection");
    expect(classifyPostgresError(Object.assign(new Error("x"), { code: "57014" }))).toBe("timeout");
    expect(classifyPostgresError(Object.assign(new Error("x"), { code: "57P01" }))).toBe("timeout");
    expect(classifyPostgresError(Object.assign(new Error("x"), { code: "42501" }))).toBe("permission");
    expect(classifyPostgresError(Object.assign(new Error("x"), { code: "23505" }))).toBe("constraint");
    expect(classifyPostgresError(Object.assign(new Error("x"), { code: "42P01" }))).toBe("other");
    expect(classifyPostgresError(new Error("Connection terminated unexpectedly"))).toBe("connection");

    const db = salesDatabase();
    const { h, token } = await signedIn(db);
    db.failure = Object.assign(new Error('permission denied for table "hr"."payroll"'), { code: "42501" });
    const lines = await captureConsole(async () => {
      const r = await resultOf(await listTables(h, token, { request_text: ASK }));
      expect(r.isError).toBe(true);
      expect(r.content[0]!.text).toMatch(/^The database refused this for lack of permission\. \(reference [0-9a-f-]{36}\)$/);
    });
    expect(lines.join("\n")).not.toContain("payroll");
    expect(auditLines(lines)[0]!.outcome).toMatchObject({ kind: "database_error", reason_class: "permission" });
  });

  it("refusals_and_errors_carry_audit_reference", async () => {
    const db = salesDatabase();
    const { h, token } = await signedIn(db);
    const cases: [() => void, () => Promise<string>][] = [
      [() => {}, async () => (await resultOf(await listTables(h, token, {}))).content[0]!.text],
      [() => { db.failure = Object.assign(new Error("down"), { code: "ECONNREFUSED" }); }, async () => (await resultOf(await listTables(h, token, { request_text: ASK }))).content[0]!.text],
      [() => { db.failure = undefined; db.flags.superuser = true; }, async () => (await listTables(h, token, { request_text: ASK })).text()],
    ];
    for (const [arrange, act] of cases) {
      arrange();
      let text = "";
      const lines = await captureConsole(async () => { text = await act(); });
      const id = String(auditLines(lines)[0]!.id);
      expect(text.endsWith(` (reference ${id})`)).toBe(true);
    }
  });
});
