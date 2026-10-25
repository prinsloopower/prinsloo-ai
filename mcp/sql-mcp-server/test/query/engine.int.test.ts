import { beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/engine/postgres.js";
import { queryRefusals } from "../../src/tools/query.js";
import { admin, as, ask, resetSql, rowsOf } from "./pg-fixture.js";

const READER = "qe_reader";
const SLOW = "qe_slow";
const REF = " (reference 00000000-0000-4000-8000-000000000000)";
const PLAN = queryRefusals("PostgreSQL").plan.sentence + REF;

beforeAll(async () => {
  await admin(`
    ${resetSql([READER, SLOW], ["qe_sales"])}
    CREATE ROLE ${READER} LOGIN PASSWORD '${READER}_pw';
    CREATE ROLE ${SLOW} LOGIN PASSWORD '${SLOW}_pw';
    ALTER ROLE ${SLOW} SET statement_timeout = '200ms';
    CREATE SCHEMA qe_sales;
    GRANT USAGE ON SCHEMA qe_sales TO ${READER}, ${SLOW};

    CREATE TABLE qe_sales.customers (id integer, name text, region text, email text);
    INSERT INTO qe_sales.customers VALUES (1, 'Ann', 'north', 'a@x'), (2, 'Bob', 'south', 'b@x'), (3, 'Cy', 'north', 'c@x');
    GRANT SELECT (id, name, region) ON qe_sales.customers TO ${READER}, ${SLOW};

    CREATE TABLE qe_sales.orders (id integer, customer_id integer, total numeric(12,2), created_at timestamptz, note text);
    INSERT INTO qe_sales.orders SELECT g, 1 + g % 3, g * 1.25, timestamptz '2026-01-05 22:30:00+00' + g * interval '1 hour', 'n' || g FROM generate_series(1, 501) g;
    GRANT SELECT ON qe_sales.orders TO ${READER};

    CREATE TABLE qe_sales.events (id integer, at date) PARTITION BY RANGE (at);
    CREATE TABLE qe_sales.events_2026 PARTITION OF qe_sales.events FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
    INSERT INTO qe_sales.events VALUES (1, '2026-03-01'), (2, '2026-04-01');
    GRANT SELECT ON qe_sales.events TO ${READER};

    CREATE TABLE qe_sales.inh_parent (id integer);
    CREATE TABLE qe_sales.inh_child () INHERITS (qe_sales.inh_parent);
    INSERT INTO qe_sales.inh_parent VALUES (1);
    INSERT INTO qe_sales.inh_child VALUES (2);
    GRANT SELECT ON qe_sales.inh_parent TO ${READER};

    CREATE TABLE qe_sales.secret (id integer);
    INSERT INTO qe_sales.secret VALUES (1), (2);
    CREATE TABLE qe_sales.leaf (id integer);
    INSERT INTO qe_sales.leaf VALUES (1), (2), (3);
    CREATE TABLE qe_sales.members (id integer);
    INSERT INTO qe_sales.members VALUES (1), (2);
    ALTER TABLE qe_sales.members ENABLE ROW LEVEL SECURITY;
    CREATE POLICY members_leaf ON qe_sales.members USING (EXISTS (SELECT 1 FROM qe_sales.leaf l WHERE l.id = members.id));
    CREATE TABLE qe_sales.projects (id integer);
    INSERT INTO qe_sales.projects VALUES (1), (2), (3);
    ALTER TABLE qe_sales.projects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY projects_members ON qe_sales.projects USING (EXISTS (SELECT 1 FROM qe_sales.members m WHERE m.id = projects.id));
    CREATE TABLE qe_sales.guarded (id integer);
    INSERT INTO qe_sales.guarded VALUES (1);
    ALTER TABLE qe_sales.guarded ENABLE ROW LEVEL SECURITY;
    CREATE POLICY guarded_secret ON qe_sales.guarded USING (EXISTS (SELECT 1 FROM qe_sales.secret s WHERE s.id = guarded.id));
    CREATE FUNCTION qe_sales.even(i integer) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $f$ BEGIN RETURN i % 2 = 0; END $f$;
    CREATE TABLE qe_sales.by_function (id integer);
    INSERT INTO qe_sales.by_function VALUES (1), (2), (3), (4);
    ALTER TABLE qe_sales.by_function ENABLE ROW LEVEL SECURITY;
    CREATE POLICY by_function_even ON qe_sales.by_function USING (qe_sales.even(id));
    GRANT SELECT ON qe_sales.leaf, qe_sales.members, qe_sales.projects, qe_sales.guarded, qe_sales.by_function TO ${READER};
  `);
}, 30_000);

describe("S-003 Query check: plan layer", () => {
  it("plan_accepts_partitions_and_inheritance_children", async () => {
    expect(rowsOf(await ask(READER, "SELECT e.id FROM qe_sales.events e ORDER BY e.id"))).toEqual([[1], [2]]);
    // The child is not granted, but PostgreSQL reads it under the parent's grant.
    expect(rowsOf(await ask(READER, "SELECT i.id FROM qe_sales.inh_parent i ORDER BY i.id"))).toEqual([[1], [2]]);
  });

  it("plan_accepts_policy_tables_of_named_table", async () => {
    expect(rowsOf(await ask(READER, "SELECT m.id FROM qe_sales.members m ORDER BY m.id"))).toEqual([[1], [2]]);
  });

  it("plan_follows_nested_policy_tables", async () => {
    expect(rowsOf(await ask(READER, "SELECT p.id FROM qe_sales.projects p ORDER BY p.id"))).toEqual([[1], [2]]);
  });

  it("policy_functions_run_as_written", async () => {
    expect(rowsOf(await ask(READER, "SELECT b.id FROM qe_sales.by_function b ORDER BY b.id"))).toEqual([[2], [4]]);
  });

  it("policy_reading_ungranted_table_refused", async () => {
    expect(rowsOf(await ask(READER, "SELECT g.id FROM qe_sales.guarded g"))).toEqual({ error: PLAN });
  });

  it("plan_failures_share_one_sentence", async () => {
    for (const sql of [
      "SELECT c.name + 1 FROM qe_sales.customers c",
      "SELECT c.name, count(*) FROM qe_sales.customers c",
      "SELECT lower(c.id) FROM qe_sales.customers c",
      "SELECT o.id FROM qe_sales.orders o WHERE o.created_at > 'not a time'",
    ]) {
      const answer = await ask(READER, sql);
      expect(rowsOf(answer), sql).toEqual({ error: PLAN });
      expect(answer.outcome).toMatchObject({ kind: "refusal", reason_class: "query_check" });
    }
  });

  it("constant_folding_error_is_plan_refusal", async () => {
    for (const sql of ["SELECT 1/0", "SELECT '2024-13-01'::date"]) {
      expect(rowsOf(await ask(READER, sql)), sql).toEqual({ error: PLAN });
    }
  });
});

describe("S-003 Agent-written queries: execution", () => {
  it("query_runs_read_only_with_pinned_search_path", async () => {
    // Below the Query check, which would refuse current_setting, over the same connection path.
    const outcome = await new PostgresDatabase(as(READER)).query("SELECT current_setting('transaction_read_only'), current_setting('search_path')", [], 500);
    expect(outcome).toMatchObject({ kind: "ok", run: { rows: [["on", "pg_catalog"]] } });
  });

  it("query_returns_columns_and_rows", async () => {
    const answer = await ask(
      READER,
      "SELECT c.region, count(*) AS orders FROM qe_sales.orders o JOIN qe_sales.customers c ON c.id = o.customer_id GROUP BY c.region ORDER BY c.region",
    );
    expect(answer.result.structuredContent).toEqual({
      columns: [{ name: "region", type: "text" }, { name: "orders", type: "bigint" }],
      rows: [["north", "334"], ["south", "167"]],
      row_count: 2,
      cut_short: false,
    });
    expect(answer.outcome).toEqual({ kind: "ok", row_count: 2, cut_short: false });
  });

  it("query_cut_short_at_row_limit", async () => {
    const answer = await ask(READER, "SELECT o.id FROM qe_sales.orders o ORDER BY o.id");
    const body = answer.result.structuredContent as { rows: unknown[][]; row_count: number; cut_short: boolean };
    expect(body.rows).toHaveLength(500);
    expect(body.rows[499]).toEqual([500]);
    expect(body).toMatchObject({ row_count: 500, cut_short: true });
    expect(answer.result.content[0]!.text.endsWith("The result was cut short at the Row limit of 500 rows; more rows match.")).toBe(true);
    expect(answer.outcome).toEqual({ kind: "ok", row_count: 500, cut_short: true });
    const three = await ask(READER, "SELECT o.id FROM qe_sales.orders o WHERE o.id <= 4 ORDER BY o.id", { rowLimit: 3 });
    expect(three.result.structuredContent).toMatchObject({ rows: [[1], [2], [3]], row_count: 3, cut_short: true });
    expect(three.result.content[0]!.text.endsWith("The result was cut short at the Row limit of 3 rows; more rows match.")).toBe(true);
  });

  it("query_at_exactly_row_limit_not_cut_short", async () => {
    const answer = await ask(READER, "SELECT o.id FROM qe_sales.orders o WHERE o.id <= 500");
    expect(answer.result.structuredContent).toMatchObject({ row_count: 500, cut_short: false });
    expect(answer.result.content[0]!.text).not.toContain("cut short");
  });

  it("query_values_keep_database_text_form", async () => {
    const [expected] = await admin<{ n: string; total: string; at: string }>(
      "SELECT count(*)::text AS n, max(total)::text AS total, min(created_at)::text AS at FROM qe_sales.orders",
    );
    const answer = await ask(READER, "SELECT count(*), max(o.total), min(o.created_at) FROM qe_sales.orders o");
    expect(rowsOf(answer)).toEqual([[expected!.n, expected!.total, expected!.at]]);
    expect(expected!.total).toBe("626.25");
  });

  it("query_values_follow_shared_json_forms", async () => {
    const answer = await ask(READER, "SELECT 1::int2, 2::int4, 1.5::float4, 2.5::float8, 'NaN'::float8, 'Infinity'::float8, '-Infinity'::float8, true, false, NULL::int4");
    expect(rowsOf(answer)).toEqual([[1, 2, 1.5, 2.5, "NaN", "Infinity", "-Infinity", true, false, null]]);
  });

  it("query_column_types_named_as_list_tables", async () => {
    const answer = await ask(READER, "SELECT count(*) AS n, o.total, o.created_at FROM qe_sales.orders o GROUP BY o.total, o.created_at LIMIT 1");
    expect((answer.result.structuredContent as { columns: unknown }).columns).toEqual([
      { name: "n", type: "bigint" },
      { name: "total", type: "numeric(12,2)" },
      { name: "created_at", type: "timestamp with time zone" },
    ]);
  });

  it("at_time_zone_and_array_constructors_run", async () => {
    // Order 1 is at 23:30 UTC on Monday 2026-01-05, which is 01:30 on Tuesday in Johannesburg.
    expect(rowsOf(await ask(READER, "SELECT date_trunc('day', o.created_at AT TIME ZONE 'Africa/Johannesburg') AS d FROM qe_sales.orders o WHERE o.id = 1"))).toEqual([
      ["2026-01-06 00:00:00"],
    ]);
    expect(rowsOf(await ask(READER, "SELECT ARRAY[1, 2, 3], ARRAY(SELECT o.id FROM qe_sales.orders o ORDER BY o.id LIMIT 3)"))).toEqual([["{1,2,3}", "{1,2,3}"]]);
    expect(rowsOf(await ask(READER, "SELECT o.id FROM qe_sales.orders o WHERE o.id = ANY (ARRAY[1, 2]) ORDER BY o.id"))).toEqual([[1], [2]]);
  });

  it("query_sent_over_extended_protocol", async () => {
    // Below the Query check, which would refuse two statements: the Database itself refuses them.
    const outcome = await new PostgresDatabase(as(READER)).query("SELECT 1; SELECT 2", [], 500);
    expect(outcome).toEqual({ kind: "plan_refused", unaccounted: false, code: "42601" });
  });
});

describe("S-003 Agent-written queries: Database errors", () => {
  it("query_execution_error_classed_without_driver_text", async () => {
    const answer = await ask(READER, "SELECT 1 / (c.id - c.id) FROM qe_sales.customers c");
    expect(rowsOf(answer)).toEqual({ error: `The database could not complete this.${REF}` });
    expect(answer.outcome).toMatchObject({ kind: "database_error", reason_class: "other" });
    expect(answer.statement).toMatchObject({ sql: "SELECT 1 / (c.id - c.id) FROM qe_sales.customers c", rows: 0 });
  });

  it("failure_after_fetch_keeps_statement", async () => {
    // The column-type lookup runs after the rows were fetched, so the query was sent.
    class FailingAfterFetch extends PostgresDatabase {
      protected override async typeNames(): Promise<string[]> {
        throw Object.assign(new Error("terminating connection"), { code: "57P01" });
      }
    }
    const outcome = await new FailingAfterFetch(as(READER)).query("SELECT o.id FROM qe_sales.orders o WHERE o.id = 1", [{ schema: "qe_sales", table: "orders" }], 500);
    expect(outcome).toMatchObject({ kind: "error", sent: true });
  });

  it("query_statement_timeout_is_timeout", async () => {
    const answer = await ask(SLOW, "SELECT count(*) FROM generate_series(1, 300000000) AS g(n)");
    expect(rowsOf(answer)).toEqual({ error: `The database stopped the query before it finished.${REF}` });
    expect(answer.outcome).toMatchObject({ kind: "database_error", reason_class: "timeout" });
  }, 30_000);
});
