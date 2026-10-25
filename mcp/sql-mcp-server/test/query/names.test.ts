import { describe, expect, it } from "vitest";
import { check, verdict } from "./catalog.js";

async function expectAll(queries: string[], expected: string, opts: Parameters<typeof verdict>[1] = {}) {
  for (const sql of queries) expect(await verdict(sql, opts), sql).toBe(expected);
}

/** The column-existence probes from the S-003 critiques; `t` is `sales.customers`, whose `email` is not granted. */
const PROBES = [
  "SELECT email FROM sales.customers t, (SELECT 1 AS email) s",
  "SELECT s.email FROM sales.customers t NATURAL JOIN (SELECT 'z'::text AS email) s",
  "SELECT 1 AS email FROM sales.customers t GROUP BY email",
  "SELECT string_agg(t.id::text, ',' ORDER BY email) AS email FROM sales.customers t, (SELECT 1 AS email) s",
  "SELECT row_number() OVER (ORDER BY email) FROM sales.customers t, (SELECT 1 AS email) s",
  "SELECT 1 FROM sales.customers c(a, b, x)",
  "SELECT 1 FROM sales.customers c(a, b, x, y)",
  "SELECT 1 FROM sales.customers c(id, name, region)",
  "SELECT j.email FROM (sales.customers c JOIN (SELECT 1 AS email) s ON true) AS j",
  "SELECT c.email FROM sales.customers c",
  "SELECT t.email FROM sales.customers t JOIN (SELECT 1 AS id) s USING (id)",
];

describe("S-003 Query check: names", () => {
  it("hidden_and_missing_tables_refused_alike", async () => {
    await expectAll(["SELECT p.id FROM hr.payroll p", "SELECT n.id FROM sales.nosuch n", "SELECT n.id FROM nosuch.nosuch n"], "hidden");
    expect(await check("SELECT p.id FROM hr.payroll p")).toEqual(await check("SELECT n.id FROM hr.nosuch n"));
  });

  it("hidden_and_missing_columns_refused_alike", async () => {
    await expectAll(["SELECT c.email FROM sales.customers c", "SELECT c.nosuch FROM sales.customers c", "SELECT c.id FROM sales.customers c WHERE c.email = 'x'"], "hidden");
    expect(await check("SELECT c.email FROM sales.customers c")).toEqual(await check("SELECT c.email FROM sales.customers c", { email: false }));
  });

  it("boundary_excluded_table_refused", async () => {
    const boundary = { exclude: [["sales", "customers"]] as [string, string][] };
    expect(await verdict("SELECT c.id FROM sales.customers c", { boundary })).toBe("hidden");
    expect(await verdict("SELECT o.id FROM sales.orders o", { boundary })).toBe("ok");
    expect(await verdict("SELECT o.id FROM sales.orders o", { boundary: { schemas: ["other"], exclude: [] } })).toBe("hidden");
  });

  it("unqualified_columns_natural_and_using_refused", async () => {
    await expectAll(
      [
        "SELECT region FROM sales.customers c",
        "SELECT c.id FROM sales.customers c WHERE region = 'x'",
        "SELECT c.region FROM sales.customers c GROUP BY region",
        "SELECT c FROM sales.customers c",
        "SELECT o.id FROM sales.orders o NATURAL JOIN sales.customers c",
        "SELECT o.id FROM sales.orders o JOIN sales.customers c USING (id)",
        "SELECT DISTINCT ON (region) c.region FROM sales.customers c",
        "SELECT c.region AS r FROM sales.customers c GROUP BY r",
      ],
      "unqualified",
    );
  });

  it("order_by_output_alias_accepted", async () => {
    await expectAll(
      [
        "SELECT c.region AS r FROM sales.customers c ORDER BY r",
        "SELECT c.region AS r, count(*) AS n FROM sales.customers c GROUP BY c.region ORDER BY n DESC, r",
        "SELECT c.region AS r FROM sales.customers c UNION SELECT o.id::text FROM sales.orders o ORDER BY r",
      ],
      "ok",
    );
    await expectAll(
      [
        "SELECT c.region FROM sales.customers c ORDER BY region",
        "SELECT c.region AS r, c.name AS r FROM sales.customers c ORDER BY r",
        "SELECT c.region AS r FROM sales.customers c ORDER BY r || 'x'",
      ],
      "unqualified",
    );
  });

  it("bare_names_in_aggregate_and_window_order_refused", async () => {
    await expectAll(
      [
        "SELECT string_agg(c.name, ',' ORDER BY r) AS r FROM sales.customers c",
        "SELECT row_number() OVER (ORDER BY r) AS r FROM sales.customers c",
        "SELECT row_number() OVER (PARTITION BY r) AS r FROM sales.customers c",
        "SELECT c.region AS r FROM sales.customers c WINDOW w AS (ORDER BY r)",
      ],
      "unqualified",
    );
  });

  it("column_existence_probes_refused_alike", async () => {
    for (const sql of PROBES) {
      const granted = await check(sql);
      expect(granted.ok, sql).toBe(false);
      expect(granted, sql).toEqual(await check(sql, { email: false }));
    }
  });

  it("table_column_alias_lists_and_join_aliases_refused", async () => {
    await expectAll(
      [
        "SELECT 1 FROM sales.customers c(a, b, x)",
        "SELECT c.a FROM sales.customers c(a)",
        "SELECT j.id FROM (sales.orders o JOIN sales.customers c ON c.id = o.id) AS j",
        "SELECT 1 FROM (sales.orders o JOIN sales.customers c ON c.id = o.id) AS j",
      ],
      "unsupported",
    );
  });

  it("subquery_columns_must_be_output_names", async () => {
    await expectAll(
      [
        "SELECT s.n FROM (SELECT o.id AS n FROM sales.orders o) s",
        "SELECT s.id FROM (SELECT o.id FROM sales.orders o) s",
        "SELECT s.a FROM (SELECT o.id FROM sales.orders o) s(a)",
        "SELECT s.id, s.total FROM (SELECT o.* FROM sales.orders o) s",
        "WITH w AS (SELECT o.id AS n FROM sales.orders o) SELECT w.n FROM w",
        "WITH w(a) AS (SELECT o.id FROM sales.orders o) SELECT w.a FROM w",
      ],
      "ok",
    );
    await expectAll(
      [
        "SELECT s.row_to_json FROM (SELECT c.id, c.region FROM sales.customers c) s",
        "SELECT s.nosuch FROM (SELECT o.id FROM sales.orders o) s",
        "SELECT s.count FROM (SELECT count(*) FROM sales.orders o) s",
        "SELECT s.column1 FROM (VALUES (1)) s",
        "WITH w AS (SELECT o.id + 1 FROM sales.orders o) SELECT w.row_to_json FROM w",
        "SELECT s.id FROM (SELECT o.id FROM sales.orders o) s(a)",
      ],
      "unnamed_output",
    );
  });

  it("function_columns_only_through_alias_list", async () => {
    await expectAll(["SELECT g.n FROM generate_series(1, 3) AS g(n)", "SELECT u.x FROM unnest(ARRAY[1, 2]) AS u(x)"], "ok");
    await expectAll(
      [
        "SELECT g.anything_else FROM generate_series(1, 3) AS g(n)",
        "SELECT g.g FROM generate_series(1, 3) AS g",
        "SELECT generate_series.generate_series FROM generate_series(1, 3)",
        "SELECT g.row_to_json FROM generate_series(1, 3) AS g(n)",
      ],
      "unnamed_output",
    );
  });

  it("star_only_over_fully_visible_tables", async () => {
    await expectAll(["SELECT * FROM sales.orders", "SELECT o.* FROM sales.orders o", "SELECT o.*, c.id FROM sales.orders o JOIN sales.customers c ON c.id = o.id"], "ok");
    await expectAll(
      ["SELECT * FROM sales.customers", "SELECT c.* FROM sales.customers c", "SELECT * FROM sales.orders o JOIN sales.customers c ON c.id = o.id", "SELECT i.* FROM sales.items i"],
      "star",
    );
    await expectAll(["SELECT count(o.*) FROM sales.orders o", "SELECT row_to_json(o.*) FROM sales.orders o"], "unsupported");
  });
});
