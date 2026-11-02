# Queries: the SQL an Agent-written query may use

The Query check accepts only what this list names, and refuses every other construct. It applies to the SELECTs the Agent writes itself through the `query` tool, which [queries.md](queries.md) describes. This release serves PostgreSQL. MS SQL Server's list will follow with its Deployment.

| | PostgreSQL |
|---|---|
| statement | one `SELECT`, optionally under `WITH` (recursive allowed, data-modifying CTEs refused) |
| clauses | `FROM`, all `JOIN` kinds, `WHERE`, `GROUP BY` (with `ROLLUP`/`CUBE`/`GROUPING SETS`), `HAVING`, `WINDOW`, `ORDER BY`, `LIMIT`, `OFFSET`, `DISTINCT [ON]`, `UNION`/`INTERSECT`/`EXCEPT`, subqueries, `CASE`, casts, `VALUES`, `ARRAY[…]` and `ARRAY(subquery)` (no subscripts) |
| refused | `FOR UPDATE`/`SHARE`, `INTO`, `TABLESAMPLE`, `pg_catalog` and `information_schema`, set-returning functions other than `unnest` and `generate_series` |
| aggregate | `count sum avg min max string_agg array_agg bool_and bool_or stddev stddev_pop stddev_samp variance var_pop var_samp percentile_cont percentile_disc mode` |
| window | `row_number rank dense_rank percent_rank cume_dist ntile lag lead first_value last_value nth_value` |
| date/time | `now current_date current_timestamp date_trunc date_part extract age make_date make_timestamp to_char to_date to_timestamp justify_days justify_hours justify_interval` and `AT TIME ZONE`/`AT LOCAL` (`timezone`) |
| text | `lower upper length char_length substring trim ltrim rtrim replace concat concat_ws left right position strpos split_part initcap lpad rpad` and the `LIKE`/`ILIKE` operators |
| numeric | `abs round ceil floor trunc mod power sqrt sign greatest least` |
| conditional | `coalesce nullif` |

Every other function is refused, including `nextval`, `pg_sleep`, `set_config`, `current_setting`, `dblink*`, `lo_*`, `pg_read_*` and every user-defined function.
