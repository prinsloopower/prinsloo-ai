import { describe, expect, it } from "vitest";
import { check, verdict } from "./catalog.js";
import { SUPPORTED } from "./constructs.js";

async function expectAll(queries: string[], expected: string) {
  for (const sql of queries) expect(await verdict(sql), sql).toBe(expected);
}

describe("S-003 Query check: structure", () => {
  it("query_check_accepts_every_supported_construct", async () => {
    for (const [name, sql] of Object.entries(SUPPORTED)) expect(await verdict(sql), name).toBe("ok");
    const r = await check("SELECT o.id, c.name FROM sales.orders o JOIN sales.customers c ON c.id = o.id");
    expect(r).toEqual({ ok: true, tables: [{ schema: "sales", table: "orders" }, { schema: "sales", table: "customers" }] });
  });

  it("query_check_refuses_writes_and_role_changes", async () => {
    await expectAll(
      [
        "INSERT INTO sales.orders VALUES (1, 2)",
        "UPDATE sales.orders SET total = 0",
        "DELETE FROM sales.orders",
        "TRUNCATE sales.orders",
        "SET ROLE postgres",
        "RESET ROLE",
        "COPY sales.orders TO STDOUT",
        "COPY (SELECT 1) TO '/tmp/x'",
      ],
      "not_select",
    );
  });

  it("query_check_refuses_more_than_one_statement", async () => {
    await expectAll(["SELECT o.id FROM sales.orders o; SELECT c.id FROM sales.customers c", "SELECT 1; DELETE FROM sales.orders"], "not_select");
    expect(await verdict("SELECT o.id FROM sales.orders o;")).toBe("ok");
  });

  it("query_check_refuses_data_modifying_ctes", async () => {
    await expectAll(
      [
        "WITH d AS (DELETE FROM sales.orders RETURNING id) SELECT d.id FROM d",
        "WITH u AS (UPDATE sales.orders SET total = 0 RETURNING id) SELECT u.id FROM u",
        "WITH i AS (INSERT INTO sales.orders VALUES (1, 2) RETURNING id) SELECT i.id FROM i",
      ],
      "not_select",
    );
  });

  it("query_check_refuses_locking_into_and_tablesample", async () => {
    await expectAll(["SELECT o.id FROM sales.orders o FOR UPDATE", "SELECT o.id FROM sales.orders o FOR SHARE", "SELECT o.id INTO t FROM sales.orders o"], "not_select");
    expect(await verdict("SELECT o.id FROM sales.orders o TABLESAMPLE SYSTEM (10)")).toBe("unsupported");
  });

  it("query_check_refuses_unlisted_functions_and_value_functions", async () => {
    await expectAll(
      [
        "SELECT pg_sleep(1)",
        "SELECT set_config('a.b', 'c', false)",
        "SELECT current_setting('search_path')",
        "SELECT current_user",
        "SELECT session_user",
        "SELECT current_schema",
        "SELECT md5(c.name) FROM sales.customers c",
        "SELECT nextval('s')",
        "SELECT o.id FROM sales.orders o, pg_catalog.pg_ls_dir('.') AS d(n)",
        "SELECT x.n FROM json_each('{}') AS x(n)",
        "SELECT o.id FROM sales.orders o WHERE o.id = public.f()",
      ],
      "unsupported",
    );
  });

  it("query_check_refuses_system_catalogs", async () => {
    await expectAll(
      [
        "SELECT c.relname FROM pg_catalog.pg_class c",
        "SELECT t.table_name FROM information_schema.tables t",
        "SELECT x.chunk_id FROM pg_toast.pg_toast_1 x",
        "SELECT o.id FROM sales.orders o WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_roles r)",
      ],
      "unsupported",
    );
  });

  it("query_check_casts_only_to_listed_types", async () => {
    await expectAll(
      [
        "SELECT 'x'::regclass",
        "SELECT '{x}'::pg_catalog._regclass",
        "SELECT '{x}'::regclass[]",
        "SELECT '{1}'::int4[]",
        "SELECT 'x'::public.sometype",
        "SELECT '{}'::json",
        "SELECT CAST('x' AS regtype)",
        "SELECT regclass 'x'",
        "SELECT '1'::\"char\"",
        "SELECT 'a'::text('ann@example.com')",
        "SELECT CAST('a' AS pg_catalog.varchar('ann@example.com'))",
        "SELECT 1::numeric(12, 'x')",
      ],
      "unsupported",
    );
    await expectAll(
      [
        "SELECT 1::integer, 1::bigint, 1::smallint, true::boolean, 1::real, 1::double precision, 1::numeric(12,2), 1::decimal",
        "SELECT 'a'::text, 'a'::varchar(5), 'a'::character varying, 'a'::char(2), 'a'::bpchar",
        "SELECT '2026-01-01'::date, '10:00'::time, '10:00'::timetz, now()::timestamp, now()::timestamp with time zone, now()::timestamptz",
        "SELECT interval '1 day', '1 hour'::interval, '00000000-0000-0000-0000-000000000000'::uuid, 1::int4, 1::pg_catalog.int8",
      ],
      "ok",
    );
  });

  it("query_check_refuses_schemas_other_than_pg_catalog", async () => {
    await expectAll(
      [
        "SELECT public.lower(c.name) FROM sales.customers c",
        "SELECT sales.lower(c.name) FROM sales.customers c",
        "SELECT o.id OPERATOR(public.+) 1 FROM sales.orders o",
        "SELECT o.id FROM sales.orders o WHERE o.id OPERATOR(sales.=) 1",
        "SELECT 'x'::sales.kind_t",
      ],
      "unsupported",
    );
    await expectAll(["SELECT pg_catalog.lower(c.name) FROM sales.customers c", "SELECT o.id OPERATOR(pg_catalog.+) 1 FROM sales.orders o"], "ok");
  });

  it("query_check_refuses_unqualified_tables", async () => {
    await expectAll(["SELECT o.id FROM orders o", "SELECT orders.id FROM orders", "SELECT c.id FROM customers c JOIN sales.orders o ON o.id = c.id"], "unqualified");
  });

  it("query_check_accepts_listed_expression_nodes", async () => {
    await expectAll(
      [
        "SELECT o.id FROM sales.orders o WHERE o.total IS NULL OR o.total IS NOT NULL",
        "SELECT o.id FROM sales.orders o WHERE (o.total > 0) IS NOT TRUE AND (o.total > 0) IS FALSE",
        "SELECT o.id FROM sales.orders o WHERE o.id IN (1, 2) AND o.id NOT IN (3)",
        "SELECT o.id FROM sales.orders o WHERE o.id IN (SELECT c.id FROM sales.customers c)",
        "SELECT o.id FROM sales.orders o WHERE o.total BETWEEN 1 AND 2 OR o.total NOT BETWEEN SYMMETRIC 3 AND 4",
        "SELECT o.id FROM sales.orders o WHERE o.total IS DISTINCT FROM 0 AND o.id IS NOT DISTINCT FROM 1",
        "SELECT o.id FROM sales.orders o WHERE EXISTS (SELECT 1 FROM sales.customers c WHERE c.id = o.id)",
        "SELECT o.id FROM sales.orders o WHERE o.id = ANY (SELECT c.id FROM sales.customers c) AND o.id <> ALL (SELECT c.id FROM sales.customers c)",
        "SELECT (SELECT max(c.id) FROM sales.customers c) AS m",
        "SELECT CASE o.id WHEN 1 THEN 'one' ELSE 'other' END AS w FROM sales.orders o WHERE NOT (o.id = 1 AND o.id = 2)",
        "SELECT count(DISTINCT o.id), count(*) FILTER (WHERE o.total > 0) FROM sales.orders o",
        "SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY o.total) FROM sales.orders o",
        "SELECT row_number() OVER (PARTITION BY c.region ORDER BY o.id) FROM sales.orders o JOIN sales.customers c ON c.id = o.id",
        "SELECT sum(o.total) OVER (ORDER BY o.id ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) FROM sales.orders o",
        "SELECT c.region, count(*) FROM sales.customers c GROUP BY ROLLUP (c.region)",
        "SELECT c.region AS r FROM sales.customers c ORDER BY r",
        "SELECT o.id FROM sales.orders o WHERE o.id = -1 AND o.total * 2 / 3 % 4 + 1 > 0 AND o.id::text || 'x' = 'y'",
      ],
      "ok",
    );
  });

  it("query_check_accepts_at_time_zone_and_array_constructors", async () => {
    await expectAll(
      [
        "SELECT date_trunc('day', now() AT TIME ZONE 'Africa/Johannesburg')",
        "SELECT now() AT LOCAL",
        "SELECT ARRAY[1, 2, 3]",
        "SELECT o.id FROM sales.orders o WHERE o.id = ANY (ARRAY[1, 2])",
        "SELECT ARRAY(SELECT o.id FROM sales.orders o ORDER BY o.id LIMIT 3)",
      ],
      "ok",
    );
  });

  it("query_check_refuses_unlisted_node_types", async () => {
    await expectAll(
      [
        "SELECT c.region COLLATE \"C\" FROM sales.customers c",
        "SELECT (ARRAY[1, 2])[1]",
        "SELECT ROW(c.id, c.region) FROM sales.customers c",
        "SELECT $1",
        "SELECT GROUPING(c.region) FROM sales.customers c GROUP BY c.region",
        "SELECT XMLPARSE(DOCUMENT '<a/>')",
        "SELECT j.a FROM JSON_TABLE('[]', '$[*]' COLUMNS (a int PATH '$')) AS j",
        "SELECT c.id FROM sales.customers c WHERE c.name SIMILAR TO 'a%'",
        "SELECT c.id FROM sales.customers c ORDER BY c.id USING >",
        "SELECT x.n FROM ROWS FROM (generate_series(1, 2)) AS x(n)",
        "SELECT g.n FROM generate_series(1, 2) WITH ORDINALITY AS g(n, i)",
        "SELECT o.id FROM sales.orders o WHERE (o.id, o.total) = (1, 2)",
        "SELECT CURRENT_ROLE",
        "SELECT o.id FROM ONLY sales.orders o ORDER BY o.id FETCH FIRST 1 ROWS WITH TIES",
      ],
      "unsupported",
    );
  });

  it("deeply_nested_query_refused_as_query_check", async () => {
    // Within 64 KiB, but nested deeper than the walk can follow.
    const deep = "SELECT o.id FROM sales.orders o WHERE o.id = o.id" + "+o.id".repeat(10_000);
    expect(new TextEncoder().encode(deep).length).toBeLessThan(65_536);
    expect(await verdict(deep)).toBe("unsupported");
    // The walk still works afterwards.
    expect(await verdict("SELECT o.id FROM sales.orders o")).toBe("ok");
  });

  it("query_check_bounds_query_size", async () => {
    const base = "SELECT o.id FROM sales.orders o -- ";
    const exactly = (bytes: number) => base + "x".repeat(bytes - new TextEncoder().encode(base).length);
    expect(await verdict(exactly(65_536))).toBe("ok");
    expect(await verdict(exactly(65_537))).toBe("too_long");
    // Bytes, not characters: 21,846 three-byte characters are 65,538 bytes.
    expect(await verdict(base + "€".repeat(21_846))).toBe("too_long");
    expect(await verdict("SELEC 1")).toBe("not_parsed");
  });
});
