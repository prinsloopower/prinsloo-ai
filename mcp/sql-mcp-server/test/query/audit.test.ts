import { describe, expect, it } from "vitest";
import { redactSql } from "../../src/engine/postgres-redact.js";
import { captureConsole, harness, signIn } from "../signin/helpers.js";
import { queryDatabase } from "./catalog.js";
import { ASK, auditLines, callQuery, opLinesOf, resultOf, signedIn } from "./mcp-helpers.js";
import { nodeParser, nodeQueryEngine } from "./node-parser.js";

const SQL = "SELECT o.id FROM sales.orders o WHERE o.id = 42 AND o.total = 'x'";
const REDACTED = "SELECT o.id FROM sales.orders o WHERE o.id = ? AND o.total = ?";

async function auditOf(env: Record<string, string>, args: Record<string, unknown>, db = queryDatabase()) {
  const { h, token } = await signedIn(db, env);
  let lines: string[] = [];
  lines = await captureConsole(async () => {
    await resultOf(await callQuery(h, token, args));
  });
  return { audit: auditLines(lines), raw: lines.filter((l) => l.includes('"type":"audit"')) };
}

describe("S-003 Audit records for Agent-written queries", () => {
  it("query_audit_records_statement_rows_and_timing", async () => {
    const db = queryDatabase();
    db.queryOutcome = { kind: "ok", run: { columns: [{ name: "id", type: "integer" }], rows: [[1], [2]], cutShort: false, ms: 7 } };
    const { audit } = await auditOf({}, { request_text: ASK, sql: SQL }, db);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      tool: "query",
      request_text: ASK,
      inputs: {},
      staff: { sub: expect.any(String), iss: expect.any(String) },
      statements: [{ sql: REDACTED, rows: 2, ms: 7 }],
      outcome: { kind: "ok", row_count: 2, cut_short: false },
    });
    expect(audit[0]).not.toHaveProperty("submitted_sql");

    const failing = queryDatabase();
    failing.queryOutcome = { kind: "error", error: Object.assign(new Error("division by zero in sales.orders"), { code: "22012" }), sent: true, ms: 3 };
    const { audit: failed } = await auditOf({}, { request_text: ASK, sql: SQL }, failing);
    expect(failed[0]).toMatchObject({ statements: [{ sql: REDACTED, rows: 0, ms: 3 }], outcome: { kind: "database_error", reason_class: "other" } });
  });

  it("query_audit_records_submitted_sql_for_refusals", async () => {
    const refused = await auditOf({}, { request_text: ASK, sql: "SELECT p.salary FROM hr.payroll p WHERE p.id = 7" });
    expect(refused.audit[0]).toMatchObject({
      statements: [],
      submitted_sql: "SELECT p.salary FROM hr.payroll p WHERE p.id = ?",
      outcome: { kind: "refusal", reason_class: "hidden_object" },
    });
    const db = queryDatabase();
    db.queryOutcome = { kind: "plan_refused", unaccounted: false, code: "42883" };
    const planned = await auditOf({}, { request_text: ASK, sql: SQL }, db);
    expect(planned.audit[0]).toMatchObject({ statements: [], submitted_sql: REDACTED, outcome: { kind: "refusal", reason_class: "query_check" } });
  });

  it("redaction_replaces_every_literal", async () => {
    const parser = await nodeParser();
    expect(redactSql(SQL, parser, true)).toBe(REDACTED);
    expect(
      redactSql(
        "SELECT 'a', E'b\\n', $$c$$, 1, -2, 3.5, 1e3, NULL, true, interval '1 day', date '2026-01-01', 7::numeric(12,2), ARRAY[8, 9] FROM sales.orders o LIMIT 10 OFFSET 2",
        parser,
        true,
      ),
    ).toBe("SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, interval ?, date ?, ?::numeric(12,2), ARRAY[?, ?] FROM sales.orders o LIMIT ? OFFSET ?");
    expect(redactSql("SELECT o.id FROM sales.orders o WHERE o.note = 'it''s $1 \"x\"'", parser, true)).toBe("SELECT o.id FROM sales.orders o WHERE o.note = ?");
    // Ordinals in GROUP BY and ORDER BY name output columns; they are not values.
    expect(redactSql("SELECT o.id, count(*) FROM sales.orders o WHERE o.total > 5 GROUP BY 1 ORDER BY 2 DESC, 1", parser, true)).toBe(
      "SELECT o.id, count(*) FROM sales.orders o WHERE o.total > ? GROUP BY 1 ORDER BY 2 DESC, 1",
    );
    // A number past the select list names no column, so it is a value, and the SQL is kept by its length.
    for (const sql of ["SELECT o.id FROM sales.orders o ORDER BY 5551234", "SELECT o.id FROM sales.orders o GROUP BY 2", "SELECT o.id FROM sales.orders o ORDER BY -1"]) {
      expect(redactSql(sql, parser, true), sql).toBe(`<unparsed: ${sql.length} chars>`);
    }
    // Only a whole number is a type modifier; anything else written there is a value.
    for (const sql of [
      "SELECT o.id FROM sales.orders o WHERE o.total = 'a'::text('ann@example.com')",
      "SELECT CAST('a' AS pg_catalog.varchar('ann@example.com'))",
      "SELECT 'a'::numeric(12, 'x')",
    ]) {
      expect(redactSql(sql, parser, true), sql).toBe(`<unparsed: ${sql.length} chars>`);
    }
  });

  it("redaction_strips_comments", async () => {
    const parser = await nodeParser();
    const logged = redactSql("SELECT o.id -- note ann@example.com\nFROM sales.orders o /* card 4111 */ WHERE o.id = 1 AND o.\"a--b\" = '-- kept?'", parser, true);
    // Each comment becomes one space, so tokens either side of it never run together.
    expect(logged).toBe("SELECT o.id  \nFROM sales.orders o   WHERE o.id = ? AND o.\"a--b\" = ?");
    for (const value of ["ann@example.com", "4111", "kept"]) expect(logged).not.toContain(value);
    // Redaction off keeps comments, as it keeps every literal.
    expect(redactSql("SELECT 1 -- note", parser, false)).toBe("SELECT 1 -- note");
  });

  it("redaction_failure_writes_server_fault_line", async () => {
    // A query engine whose Redaction fails: the SQL is kept by its length, and the Operator is told.
    const broken = async () => ({ ...(await nodeQueryEngine()), redact: () => { throw new Error("redaction bug at /internal/path"); } });
    const h = await harness({}, { realMcp: true, database: queryDatabase(), queryEngine: broken });
    const token = (await signIn(h)).access_token;
    const lines = await captureConsole(async () => {
      await resultOf(await callQuery(h, token, { request_text: ASK, sql: SQL }));
    });
    const [record] = auditLines(lines);
    expect(record!.statements).toEqual([{ sql: `<unparsed: ${SQL.length} chars>`, rows: 0, ms: 0 }]);
    expect(opLinesOf(lines)).toContainEqual(expect.objectContaining({ event: "server_fault", tool: "query", id: record!.id }));
    expect(lines.join("\n")).not.toContain("/internal/path");
  });

  it("redaction_off_keeps_sql_as_submitted", async () => {
    const { audit } = await auditOf({ REDACTION: "off" }, { request_text: ASK, sql: SQL });
    expect(audit[0]!.statements).toEqual([{ sql: SQL, rows: 0, ms: 0 }]);
    const refused = await auditOf({ REDACTION: "off" }, { request_text: ASK, sql: "SELEC 'kept'" });
    expect(refused.audit[0]!.submitted_sql).toBe("SELEC 'kept'");
  });

  it("unparsed_sql_logged_by_length", async () => {
    const parser = await nodeParser();
    expect(redactSql("SELEC 1", parser, true)).toBe("<unparsed: 7 chars>");
    expect(redactSql("SELEC 'é\u{1F600}'", parser, true)).toBe("<unparsed: 11 chars>");
    const long = "SELECT o.id FROM sales.orders o WHERE o.note = '" + "x".repeat(70_000) + "'";
    expect(redactSql(long, parser, true)).toBe(`<unparsed: ${long.length} chars>`);
    const { audit } = await auditOf({}, { request_text: ASK, sql: "SELEC 'secret-literal'" });
    expect(audit[0]!.submitted_sql).toBe("<unparsed: 22 chars>");
    // SQL the lexer cannot finish is unparsed too, and its Tool call still leaves one Audit record.
    for (const sql of ["SELECT o.id FROM sales.orders o WHERE o.total = 'secret-unterminated", "SELECT 1 /* unterminated", "SELECT $$x"]) {
      expect(redactSql(sql, parser, true), sql).toBe(`<unparsed: ${sql.length} chars>`);
      const { h, token } = await signedIn(queryDatabase());
      const lines = await captureConsole(async () => {
        const r = await resultOf(await callQuery(h, token, { request_text: ASK, sql }));
        expect(r.content[0]!.text).toMatch(/^The query was not accepted: it is not valid PostgreSQL\. \(reference [0-9a-f-]{36}\)$/);
      });
      expect(auditLines(lines).map((a) => a.submitted_sql)).toEqual([`<unparsed: ${sql.length} chars>`]);
    }
  });

  it("non_select_sql_logged_by_length_only", async () => {
    for (const sql of [
      "COPY (SELECT 1) TO '/tmp/secret-path'",
      "PREPARE p AS SELECT 'prep-secret'",
      "EXECUTE p('exec-secret')",
      "NOTIFY chan, 'notify-secret'",
      "COMMENT ON TABLE sales.orders IS 'comment-secret'",
      "CREATE TABLE sales.t2 AS SELECT 'ctas-secret'",
      "ALTER SYSTEM SET work_mem = 'sys-secret'",
      "SELECT 1; SELECT 'second-secret'",
    ]) {
      const { audit, raw } = await auditOf({}, { request_text: ASK, sql });
      expect(audit[0]!.submitted_sql, sql).toBe(`<unparsed: ${sql.length} chars>`);
      expect(raw.join("\n")).not.toMatch(/secret/);
    }
  });

  it("audit_record_capped_at_64_kib", async () => {
    const base = "SELECT o.id FROM sales.orders o WHERE o.total = '";
    const sql = base + "x".repeat(65_536 - base.length - 1) + "'";
    expect(new TextEncoder().encode(sql).length).toBe(65_536);
    const { audit, raw } = await auditOf({ REDACTION: "off" }, { request_text: "é".repeat(4000), sql });
    expect(new TextEncoder().encode(raw[0]!).length).toBeLessThanOrEqual(65_536);
    expect(audit[0]!.shortened).toBe(true);
    const logged = (audit[0]!.statements as { sql: string }[])[0]!.sql;
    expect(logged.endsWith("…[cut]")).toBe(true);
    expect(logged.startsWith(base)).toBe(true);
    expect(audit[0]!.request_text).toBe("é".repeat(4000));
  });

  it("query_audit_never_holds_result_values", async () => {
    const db = queryDatabase();
    db.queryOutcome = {
      kind: "ok",
      run: { columns: [{ name: "colname_zz9", type: "text" }], rows: [["value_zz7"], ["value_zz8"]], cutShort: false, ms: 1 },
    };
    const { raw } = await auditOf({}, { request_text: ASK, sql: "SELECT o.id AS r FROM sales.orders o" }, db);
    expect(raw).toHaveLength(1);
    expect(raw[0]).not.toMatch(/zz7|zz8|zz9/);
  });
});
