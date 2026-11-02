/**
 * Every PostgreSQL construct in the supported-constructs table (docs/security-material/constructs.md),
 * used as the Agent would write it over the fake `sales` catalog
 * (test/listing/fake-database.ts): `sales.orders (id, total)` and `sales.customers (id, name, region)`.
 */
export const SUPPORTED: Record<string, string> = {
  select: "SELECT o.id FROM sales.orders o",
  with_recursive: "WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT r.n + 1 FROM r WHERE r.n < 3) SELECT r.n FROM r",
  joins:
    "SELECT o.id, c.name FROM sales.orders o JOIN sales.customers c ON c.id = o.id LEFT JOIN sales.customers c2 ON c2.id = o.id " +
    "RIGHT JOIN sales.customers c3 ON c3.id = o.id FULL JOIN sales.customers c4 ON c4.id = o.id CROSS JOIN sales.customers c5",
  where_group_having:
    "SELECT c.region, sum(o.total) AS t FROM sales.orders o JOIN sales.customers c ON c.id = o.id WHERE o.total > 0 GROUP BY c.region HAVING count(*) > 1",
  grouping_sets:
    "SELECT c.region, c.name, count(*) FROM sales.customers c GROUP BY ROLLUP (c.region, c.name) " +
    "UNION ALL SELECT c.region, c.name, count(*) FROM sales.customers c GROUP BY CUBE (c.region, c.name) " +
    "UNION ALL SELECT c.region, c.name, count(*) FROM sales.customers c GROUP BY GROUPING SETS ((c.region), (c.name))",
  window: "SELECT o.id, sum(o.total) OVER w FROM sales.orders o WINDOW w AS (PARTITION BY o.id ORDER BY o.total)",
  order_limit_offset: "SELECT o.id AS i FROM sales.orders o ORDER BY i DESC LIMIT 10 OFFSET 5",
  distinct: "SELECT DISTINCT c.region FROM sales.customers c",
  distinct_on: "SELECT DISTINCT ON (c.region) c.region, c.name FROM sales.customers c ORDER BY c.region, c.name",
  set_operations:
    "SELECT o.id FROM sales.orders o UNION SELECT c.id FROM sales.customers c INTERSECT SELECT c.id FROM sales.customers c EXCEPT SELECT o.id FROM sales.orders o",
  subqueries: "SELECT s.n FROM (SELECT o.id AS n FROM sales.orders o) s WHERE s.n IN (SELECT c.id FROM sales.customers c)",
  case_and_casts: "SELECT CASE WHEN o.total > 10 THEN 'big' ELSE 'small' END AS size, o.total::int4, CAST(o.id AS text), date '2026-01-01' FROM sales.orders o",
  values: "SELECT v.a FROM (VALUES (1), (2)) AS v(a)",
  aggregates:
    "SELECT count(*), sum(o.total), avg(o.total), min(o.total), max(o.total), string_agg(o.id::text, ','), array_agg(o.id), " +
    "bool_and(o.total > 0), bool_or(o.total > 0), stddev(o.total), stddev_pop(o.total), stddev_samp(o.total), variance(o.total), " +
    "var_pop(o.total), var_samp(o.total), percentile_cont(0.5) WITHIN GROUP (ORDER BY o.total), " +
    "percentile_disc(0.5) WITHIN GROUP (ORDER BY o.total), mode() WITHIN GROUP (ORDER BY o.total) FROM sales.orders o",
  window_functions:
    "SELECT row_number() OVER (ORDER BY o.id), rank() OVER (ORDER BY o.id), dense_rank() OVER (ORDER BY o.id), " +
    "percent_rank() OVER (ORDER BY o.id), cume_dist() OVER (ORDER BY o.id), ntile(4) OVER (ORDER BY o.id), " +
    "lag(o.total) OVER (ORDER BY o.id), lead(o.total) OVER (ORDER BY o.id), first_value(o.total) OVER (ORDER BY o.id), " +
    "last_value(o.total) OVER (ORDER BY o.id), nth_value(o.total, 2) OVER (ORDER BY o.id) FROM sales.orders o",
  date_time:
    "SELECT now(), current_date, current_timestamp, date_trunc('day', now()), date_part('year', now()), extract(year FROM now()), " +
    "age(now()), make_date(2026, 1, 1), make_timestamp(2026, 1, 1, 0, 0, 0), to_char(now(), 'YYYY'), to_date('2026-01-01', 'YYYY-MM-DD'), " +
    "to_timestamp('2026', 'YYYY'), justify_days(interval '30 days'), justify_hours(interval '24 hours'), justify_interval(interval '1 day'), " +
    "now() AT TIME ZONE 'Africa/Johannesburg', now() AT LOCAL",
  text:
    "SELECT lower(c.name), upper(c.name), length(c.name), char_length(c.name), substring(c.name FROM 1 FOR 2), trim(c.name), " +
    "ltrim(c.name), rtrim(c.name), replace(c.name, 'a', 'b'), concat(c.name, c.region), concat_ws(',', c.name, c.region), " +
    "left(c.name, 1), right(c.name, 1), position('a' IN c.name), strpos(c.name, 'a'), split_part(c.name, ' ', 1), initcap(c.name), " +
    "lpad(c.name, 5), rpad(c.name, 5) FROM sales.customers c WHERE c.name LIKE 'A%' OR c.name ILIKE 'b%'",
  numeric:
    "SELECT abs(o.total), round(o.total), ceil(o.total), floor(o.total), trunc(o.total), mod(o.id, 2), power(o.total, 2), " +
    "sqrt(o.total), sign(o.total), greatest(o.id, 1), least(o.id, 1) FROM sales.orders o",
  conditional: "SELECT coalesce(c.name, 'none'), nullif(c.region, '') FROM sales.customers c",
  set_returning: "SELECT g.n, u.x FROM generate_series(1, 3) AS g(n), unnest(ARRAY[1, 2]) AS u(x)",
  arrays: "SELECT ARRAY[1, 2, 3], ARRAY(SELECT o.id FROM sales.orders o ORDER BY o.id LIMIT 3)",
};

/** One statement that uses every construct above, for the parser's load test; it is parsed, never run. */
export const ALL_CONSTRUCTS_SQL = Object.values(SUPPORTED)
  .map((sql) => `(${sql})`)
  .join(" UNION ALL ");
