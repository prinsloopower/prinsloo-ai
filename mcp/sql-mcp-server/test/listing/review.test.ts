import { describe, expect, it } from "vitest";
import { visibleTables } from "../../src/visibility.js";
import { callMcp, captureConsole, harness, signIn } from "../signin/helpers.js";
import { FakeDatabase, salesDatabase } from "./fake-database.js";

// Added after the S-002 code review (docs/slices/S-002/review.md, D-081).

const ASK = "Which tables can I query?";

function parsed(lines: string[], type: string) {
  return lines.map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; } }).filter((l): l is Record<string, unknown> => l?.type === type);
}

async function listTables(database: FakeDatabase, args: Record<string, unknown>) {
  const h = await harness({}, { realMcp: true, database });
  const s = await signIn(h);
  return { h, call: () => callMcp(h, s.access_token, "/mcp", { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "list_tables", arguments: args } }) };
}

describe("S-002 code review fixes", () => {
  it("boundary_exclusion_ignores_letter_case", () => {
    const db = new FakeDatabase().table("sales", "payroll", [["id", "integer"]]).table("sales", "orders", [["id", "integer"]]);
    const catalog = { flags: db.flags, rows: db.rows };
    const names = (b: { schemas?: string[]; exclude: [string, string][] }) => visibleTables(catalog, b).map((t) => `${t.schema}.${t.table}`);
    expect(names({ exclude: [["Sales", "Payroll"]] })).toEqual(["sales.orders"]);
    expect(names({ exclude: [["SALES", "payroll"]] })).toEqual(["sales.orders"]);
    expect(names({ schemas: ["Sales"], exclude: [] })).toEqual([]);
    expect(names({ schemas: ["sales"], exclude: [] })).toEqual(["sales.orders", "sales.payroll"]);
  });

  it("audit_inputs_bounded_and_catalog_read_timed", async () => {
    const db = salesDatabase();
    const big = await listTables(db, { request_text: ASK, schema: "s".repeat(1_000_000) });
    const bigAudit = parsed(await captureConsole(async () => { await big.call(); }), "audit")[0]!;
    expect(bigAudit.inputs).toEqual({ schema: `${"s".repeat(128)}…[cut]` });
    expect(bigAudit.shortened).toBe(true);

    const odd = await listTables(salesDatabase(), { request_text: ASK, schema: 7 });
    expect(parsed(await captureConsole(async () => { await odd.call(); }), "audit")[0]!.inputs).toEqual({ schema: 7 });

    const slow = salesDatabase();
    const timed = await listTables(slow, { request_text: ASK });
    const before = timed.h.clock.t;
    slow.onRead = () => timed.h.clock.advance(2);
    const audit = parsed(await captureConsole(async () => { await timed.call(); }), "audit")[0]!;
    expect(Date.parse(String(audit.ts))).toBe(before);
    expect(audit.duration_ms).toBe(2000);
  });

  it("unsafe_op_line_names_tool_call", async () => {
    const db = salesDatabase();
    const { call } = await listTables(db, { request_text: ASK });
    db.flags.superuser = true;
    const lines = await captureConsole(async () => { await call(); });
    const audit = parsed(lines, "audit")[0]!;
    expect(parsed(lines, "op")).toContainEqual(expect.objectContaining({ event: "config_invalid", variable: "HYPERDRIVE", id: audit.id }));
  });
});
