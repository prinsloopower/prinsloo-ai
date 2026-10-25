# S-003 — Answering a question from the data

Delivers: beyond the table list, a Staff member now gets figures drawn from the rows themselves. Their AI tool runs its own SELECT through the `query` tool and flags any result the Row limit cut short. Reading anything hidden, or trying to change data, comes back refused with nothing named. Each answer's Audit record gives the Operator the asker, their Request text and the SQL with its literals blanked.
Traces: J-004, J-008, R-002, R-004, R-006, R-011, R-015

## Screens
None (D-046). What the Staff member sees is their AI tool's rendering of the `query` result.

## Interface
A second tool, `query`, registered beside `list_tables` at every Permission tier. It takes Agent-written queries. Its result shape, cut-short notice and value forms are fixed for both Engines in D-082.

```
query
  description (static, names no Object): "Runs one read-only SELECT you write over the tables
    list_tables shows, and returns at most <ROW_LIMIT> rows. Qualify every table with its schema
    and every column with its table or alias. Only built-in functions are supported. Pass
    request_text: the Staff member's question in their own words."
  input:  request_text  string, 1–4,000 characters, required (ADR-011)
          sql           string, required; one PostgreSQL SELECT
  result: as D-082 fixes
```

- `<ROW_LIMIT>` is the Deployment's Row limit, written into the description when the tool is registered.
- `columns[].type` follows `list_tables`' rule (D-081): a type in `pg_catalog` is named by `format_type` of the type and its modifier, taken from the result's row description, so `numeric(12,2)` reads as it does in the listing. Any other type is `user-defined`. The names are looked up by a Server statement in the same transaction.
- Inputs are validated by the tool itself, as for `list_tables` (D-078). A `tools/call` of either tool with valid inputs reads the catalog before dispatch, so an unsafe account answers 503 for `query` exactly as it does for `list_tables`.

## Query check
ADR-005's three layers on PostgreSQL, run as the four steps below, in order. A query is never sent as a Statement until all of them pass. The parser is `@libpg-query/parser` 17.x, which provides both `parse` and `normalize` for the PostgreSQL 17 grammar. The plain `libpg-query` package has no `normalize`.

1. **Size.** Over 64 KiB (operations.md) is refused before parsing.
2. **Structure,** on the parse tree. The walk accepts only the node types listed here and in security.md's supported constructs, and refuses every other node type:
   - **One SELECT.** Exactly one statement, a `SelectStmt`, and every CTE's body is one too.
   - **Tables.** Every table reference is a CTE name in scope, or is qualified with its schema and is a Visible object for this Tool call. Names are compared as the parser folds them.
   - **Aliases.**
     - A table reference may carry an alias but never a column-alias list such as `c(a, b)`, because PostgreSQL counts every column of the table against that list, granted or not.
     - A join (`JoinExpr`) may not carry an alias.
     - A function in `FROM` may carry an alias. Its columns can be referenced only through a column-alias list, as in `generate_series(1, 3) AS g(n)` read as `g.n`.
   - **Columns.** Every column reference is qualified with a table, alias, subquery or CTE in scope. Scope runs from the innermost query outward, as PostgreSQL resolves it. The column must then be one of these:
     - where the qualifier names a table: one of that table's Visible columns. The column's type is looked through, at any depth, by a Server statement on `pg_type`, following domains to their base types, arrays to their elements, ranges and multiranges to their subtypes, and composites to their fields. It is refused if it reaches either of these:
       - a `reg*` type (`regclass`, `regtype`, `regproc`, `regprocedure`, `regoper`, `regoperator`, `regnamespace`, `regrole`, `regconfig`, `regdictionary`, `regcollation`). A `reg*` value coerces names to catalog entries and prints catalog names, which would confirm or name a Hidden object;
       - any composite type, a table's row type included. A literal coerced into a composite reveals its field count, order and types, which for a Hidden table's row type is that table's shape (D-085).

       Columns of enums, domains, ranges and extension base types that reach neither are readable (D-085);
     - where it names a subquery or CTE: one of the output names the walk can read from that subquery's or CTE's text. These are a column-alias list, an explicit `AS`, the column name of a plain qualified column reference, and the columns of an accepted `alias.*`. An output with no name the walk can read cannot be referenced. Without this rule, PostgreSQL reads `s.f` as the call `f(s)` when `f` is not a column;
     - where it names a function in `FROM`: a name in that function's column-alias list.

     `alias.*`, and `*` alone, may stand only as a whole select-list item, and only over tables whose columns are all Visible and readable under these rules (`all_columns`, D-078).
   - **Joins and unqualified names.** `NATURAL` joins and `JOIN … USING` are refused, and so is any bare column name. One exception: an item of the SelectStmt's own `ORDER BY` (`sortClause`) that is, as a whole, a bare name equal to exactly one explicit `AS` name of that SELECT. PostgreSQL resolves such an item to the output column before any input column. An aggregate's `ORDER BY`, a window's `ORDER BY` or `PARTITION BY`, and `GROUP BY` all resolve against input columns, so a bare name is refused there. `ORDER BY` and `GROUP BY` ordinals are accepted.
   - **Expressions.** The walk accepts these nodes, each only as the other rules allow, and refuses every other node type:
     - `A_Const`, `ColumnRef` and `TypeCast`;
     - `A_Expr` of kinds `OP`, `OP_ANY`, `OP_ALL`, `DISTINCT`, `NOT_DISTINCT`, `NULLIF`, `IN`, `LIKE`, `ILIKE` and the four `BETWEEN` kinds;
     - `BoolExpr` (`AND`, `OR`, `NOT`), `NullTest`, `BooleanTest`, `CaseExpr` and `CaseWhen`, `CoalesceExpr` and `MinMaxExpr`;
     - `SQLValueFunction`, as below;
     - `FuncCall`, with `*`, `DISTINCT`, `FILTER`, `WITHIN GROUP` and `OVER`;
     - `SubLink` of kinds `EXISTS`, `ANY`, `ALL`, `EXPR` (scalar) and `ARRAY`, as in `ARRAY(SELECT …)`;
     - `A_ArrayExpr`, as in `ARRAY[…]`, under D-084;
     - `SortBy`, `WindowDef` and `GroupingSet`.

     Refused node types include `CollateClause`, `A_Indirection` (subscripts and field selection), `RowExpr`, `ParamRef`, `GroupingFunc`, the `SubLink` kinds `ROWCOMPARE` and `MULTIEXPR`, and every XML and SQL/JSON node. The clause nodes are those security.md's constructs need: `ResTarget`, `RangeVar`, `RangeSubselect`, `RangeFunction`, `JoinExpr` with `ON`, `WithClause`, `CommonTableExpr`, `VALUES` lists and set operations.
   - **Functions.** Functions are checked under the names the parser gives them, against security.md's table:
     - `trim`, `ltrim` and `rtrim` arrive as `pg_catalog.btrim`, `ltrim` and `rtrim`. `substring`, `position` and `extract` arrive as `pg_catalog` calls of the same name. `x AT TIME ZONE z` arrives as `pg_catalog.timezone(z, x)`, and `x AT LOCAL` as `pg_catalog.timezone(x)` (D-084);
     - `coalesce` is a `CoalesceExpr`, `nullif` an `A_Expr` of kind `NULLIF`, `greatest` and `least` a `MinMaxExpr`, and `LIKE`/`ILIKE` `A_Expr`s of their own kinds;
     - `current_date` and `current_timestamp` are the only `SQLValueFunction`s accepted. `current_user`, `session_user`, `current_schema`, `current_catalog` and the rest are refused;
     - every other function is a `FuncCall` of its listed name, unqualified or qualified with `pg_catalog`. A set-returning function in `FROM` is `unnest` or `generate_series`.
   - **Operators.** An operator name is checked wherever the parse tree carries one: `A_Expr.name`, and `SubLink.operName`, as in `x OPERATOR(…) ANY (SELECT …)`. It is accepted unqualified or as `OPERATOR(pg_catalog.…)`, and under the pinned `search_path` (step 4) it can then resolve only to `pg_catalog`. `ORDER BY … USING`, which carries `SortBy.useOp`, is refused.
   - **Casts.** Casts and typed literals may only name these types, unqualified or in `pg_catalog`: `bool`, `int2`, `int4`, `int8`, `numeric`, `float4`, `float8`, `text`, `varchar`, `bpchar`, `date`, `time`, `timetz`, `timestamp`, `timestamptz`, `interval` and `uuid`, under any of their SQL spellings and modifiers. Cast targets that are array types, written either way (`regclass[]` or `_regclass`), are refused, as is every other type. This is an allow-list: `reg*` types fall outside it, and so do user-defined types as cast targets. A value built with `ARRAY[…]` or `ARRAY(…)` takes its element type from the values inside. A literal there can take the type of a column beside it, which is why the Columns rule looks through every readable column's type to its leaves.

   The Agent's own SQL reaches functions outside `pg_catalog` by one route only, and the Database administrator owns it:
   - **Operators:** the pinned `search_path` (step 4) lets an unqualified operator resolve only in `pg_catalog`, and qualified ones must name `pg_catalog`.
   - **Functions:** they are allow-listed by name and resolved under the same pinned `search_path`.
   - **Conversions of user-defined types:** a column of an enum, domain or extension type brings its type's own casts and domain `CHECK` constraints with it. The casts include implicit ones and those written as functions, `SECURITY DEFINER` included. A constraint runs when one of the Agent's literals is converted to the domain, for example inside `coalesce` or `ARRAY[…]`. Both run as the type's owner defined them, and are trusted like grants (D-085).

   Objects that a superuser installs into `pg_catalog` are trusted like the built-ins (D-082). These include an extension's operators, and its casts between built-in types. A row-level security policy on a Visible table runs as the Database administrator wrote it, together with any function it calls, `SECURITY DEFINER` ones included (D-083).
3. **Plan.** `EXPLAIN (VERBOSE, FORMAT JSON)` of the query is sent as a Server statement (D-026) in the transaction below. Every relation in the plan must be accounted for, by one more Server statement, as one of these:
   - a table the query names;
   - a partition or inheritance descendant of one (`pg_inherits`);
   - a table that a row-level security policy reads (`pg_depend` on `pg_policy`), on any table already accounted for, along with that table's descendants. The chain is followed to its end, so a policy table whose own policy reads another table is accounted for too. A view a policy reads counts through the tables the view reads (`pg_depend` on `pg_rewrite`).

   PostgreSQL reads descendants and policy tables under the named table's privileges. The grant on the named table governs, as the Database itself enforces (D-082). A relation the plan reads that none of these accounts for is refused. After layer 2 this should never happen, so the plan check is a backstop. PostgreSQL also checks privileges when the executor starts, which `EXPLAIN` does too. Any error from this layer is a Refusal, not a Database error, because the query was not sent. That includes errors the planner raises while folding constants, such as `SELECT 1/0` or `'2024-13-01'::date`.
4. **Execution.** The query runs on one connection inside `BEGIN READ ONLY` with `SET LOCAL search_path = pg_catalog`, set before layer 3. It is declared as a cursor, and `Row limit + 1` rows are fetched, so its text is never rewritten. The transaction is always rolled back. Every statement goes over the extended query protocol (`pg`'s `queryMode: 'extended'`), which accepts one statement only, as a second guard behind layer 2.

### Refusals
Each Refusal carries the `reason_class` and sentence D-082 fixes for its case, ending with the D-080 reference. Under the rules above, every structural Refusal depends only on the query's text and on what the listing shows: Visible tables, Visible columns, `all_columns` and column types. A Hidden object never reaches the Database, so no Refusal can tell a hidden table or column from one that does not exist.

Two outcomes do depend on the Database administrator's setup, and both are accepted in D-082:
- A Visible table whose row-level security policy reads a table the Database account is not granted cannot be queried at all. Every query over it gets the plan sentence. That shows the Agent the table is unusable, never what it depends on.
- Rows of a descendant table come back through its granted parent, even when the descendant is outside the Boundary. PostgreSQL itself reads them under the parent's grant, and the Security material says so.

## Settings
`ROW_LIMIT` (1–10,000, default 500) and `REDACTION` (`on` or `off`, default `on`) are read with the other Server settings (environments.md). An invalid value makes the whole Deployment misconfigured: MCP requests answer 503 "Deployment misconfigured: <variable>" and write `config_invalid`, with no Audit record (D-080). The project test Deployment leaves both unset, so it runs on the defaults.

## Database errors
Once the query is sent, a failure is a Database error, classed and worded as D-080 fixes. That covers errors that depend on the data read, such as a division by a column value that is zero (`other`), and a cancellation by the Database's own `statement_timeout` (`timeout`). The Server sets no time limit (D-003).

## Audit record
One record per `query` Tool call, in data-model.md's format, with the field choices D-082 records:
- `tool` is `query`, and `inputs` is `{}`.
- A query that ran has `statements: [{ sql, rows, ms }]`, where `ms` runs from the cursor's declaration to its last fetch. A Database error during execution still records the Statement, with `rows` 0.
- A refused query has `submitted_sql` and `statements: []`.
- With Redaction on, comments are first removed: each comment PostgreSQL's lexer finds becomes one space, because a comment can carry values as a literal does (D-087). `sql` and `submitted_sql` are then `normalize`'s output, with every `$n` written as `?`, under two conditions:
  - the parse tree is exactly one `SelectStmt`;
  - re-parsing the normalised text finds no `A_Const` left.

  `normalize` leaves literals in some statement types, such as `COPY`, `PREPARE`, `NOTIFY`, `COMMENT` and `CREATE … AS`. So any other SQL, including SQL that does not parse or is over 64 KiB, is logged as `<unparsed: N chars>`. N is the SQL's length in UTF-16 code units, as JavaScript counts it. With Redaction off, both are the SQL as submitted.
- `outcome.row_count` is the rows returned, and `outcome.cut_short` is true when the Row limit cut the result.
- The 64 KiB line cap applies: the longest SQL strings are cut, each ending `…[cut]`, and `shortened` is set.
- No value from a result row is written, and nor are result column names.

## Security material
This slice writes `docs/security-material/queries.md` (D-067). It covers:
- what an Agent-written query may do: the four layers above, and security.md's supported constructs;
- why tables and columns must be qualified, why `NATURAL` and `USING` joins are refused, and why columns whose types reach a `reg*` type or a composite, at any depth, cannot be read;
- that the Agent's own SQL can name only built-in functions, operators and cast targets, through the pinned `search_path` and the allow-lists. Whatever a superuser installs into `pg_catalog` is trusted like them;
- that a column of an enum, domain or extension type brings that type's casts and domain `CHECK` constraints with it. They run as their owner wrote them, `SECURITY DEFINER` included (D-085). They are trusted like grants, so a Security reviewer should review the casts and domain constraints of user-defined types in Visible columns as part of the grants;
- that row-level security policies run as the Database administrator wrote them, with every function they call, `SECURITY DEFINER` included, and are trusted like grants (D-083). A Security reviewer should review those functions as part of the grants;
- that a Refusal never names what it touched, and reads the same for a hidden table or column as for a missing one;
- that a table's partitions, inheritance children and row-level security policy tables are read under its own grant, the Boundary included. A table whose policy reads an ungranted table cannot be queried;
- the Row limit and the cut-short notice, and that the Server cannot make the AI tool pass the notice on (J-004);
- that the Database account's grants still cap every read;
- what a query's Audit record holds: the Statement or submitted SQL, redacted by default, and the Request text never redacted (R-011);
- that result rows reach the AI provider (D-036);
- Workers Logs retention as measured (T-010). The figure also goes into visibility.md's retention line.

## Proven by
- Inside workerd, `@libpg-query/parser` loads from the bundled WebAssembly module. In one test it parses and normalises a query using every PostgreSQL construct in security.md's table.
- The Worker bundle with the parser is under 10 MiB gzipped, as `wrangler deploy --dry-run` output measures.
- `tools/list` returns exactly `list_tables` and `query` at every Permission tier. Neither description contains an Object name, and `query`'s names the Row limit.
- Over `sqlmcp_reader`'s grants (S-002's T-007 fixture), `SELECT c.region, count(*) FROM sqlmcp_test.orders o JOIN sqlmcp_test.customers c ON c.id = o.customer_id GROUP BY c.region` returns one row per region, with the counts the fixture holds.
- Every function, clause and operator in security.md's PostgreSQL column is accepted when used as that table lists it, including `trim`, `substring … from`, `position … in`, `extract`, `coalesce`, `nullif`, `greatest`, `least`, `LIKE`, `ILIKE`, `current_date` and `current_timestamp`. So are the D-084 additions:
  - over a test table whose `created_at` is `timestamptz`, `date_trunc('day', o.created_at AT TIME ZONE 'Africa/Johannesburg')` groups orders by Johannesburg day. An order at 22:30 UTC on Monday counts on Tuesday;
  - `ARRAY[1, 2, 3]`, `c.id = ANY (ARRAY[1, 2])` and `ARRAY(SELECT o.id FROM sqlmcp_test.orders o ORDER BY o.id LIMIT 3)` run, and their arrays come back in PostgreSQL's text form (`{1,2,3}`).
- Each of these is refused as `query_check`. None reaches the Database except as Server statements, and most not even that:
  - `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `SET ROLE`, `RESET ROLE`, `COPY`;
  - a `WITH` holding a `DELETE … RETURNING`;
  - two statements separated by `;`;
  - `FOR UPDATE`, `SELECT … INTO`, `TABLESAMPLE`;
  - `pg_sleep(1)`, `set_config(…)`, `current_setting(…)`, `current_user`, a function in `public`;
  - `'x'::regclass`, `'{x}'::pg_catalog._regclass`, `'{x}'::regclass[]`, `'{1}'::int4[]`, a cast to `public.sometype`, `OPERATOR(public.+)`;
  - an unqualified `orders`;
  - any table in `pg_catalog` or `information_schema`;
  - `NATURAL JOIN`, `JOIN … USING (id)`;
  - an unqualified column (`SELECT region FROM sqlmcp_test.customers c`), a bare `GROUP BY` name, and a whole-row `c`;
  - `s.row_to_json` over a subquery `s` that has no such output column;
  - `c.region COLLATE "C"`, an array subscript, `ROW(c.id, c.region)`, `$1`, `GROUPING(c.region)`, `(ARRAY[1, 2])[1]` (a subscript), an `XMLPARSE` and a `JSON_TABLE`.
- Each of these is accepted:
  - `IS NULL`, `IS NOT TRUE`, `IN (1, 2)`, `IN (SELECT …)`, `BETWEEN`, `IS DISTINCT FROM`;
  - `EXISTS (…)`, `= ANY (SELECT …)`, a scalar subquery;
  - `CASE`, `AND`/`OR`/`NOT`;
  - `count(DISTINCT …)`, `FILTER (WHERE …)`, `percentile_cont(0.5) WITHIN GROUP (ORDER BY …)`, `OVER (PARTITION BY c.region ORDER BY o.id)`;
  - `GROUP BY ROLLUP (…)`;
  - `SELECT c.region AS r … ORDER BY r`.
- `SELECT * FROM sqlmcp_test.customers` (only some columns granted) is refused with D-082's "name the columns" sentence. `SELECT * FROM sqlmcp_test.orders` (fully granted) runs.
- On a granted table with a `regclass` column `r`, each of these is refused, and none reaches the Database:
  - `SELECT t.r::text`;
  - `WHERE coalesce(t.r, 'sqlmcp_test.staff') = t.r`;
  - `… UNION SELECT 'sqlmcp_test.staff'` against `t.r`;
  - `SELECT t.*`.

  The same probes with `sqlmcp_test.nosuch` get the same Refusal. So does each of these columns, with the critique's probes against it:
  - a domain over `regclass`;
  - an array of such a domain;
  - a range over `regclass`;
  - a composite with a `regclass` field;
  - a composite of plain types;
  - a Hidden table's row type.

  The probes are `SELECT t.x`, `ARRAY[t.x, '(sqlmcp_test.staff)']`, `coalesce(t.x, …)` and `… UNION SELECT …`.
- Each of these is refused as `hidden_object` with one and the same sentence, and none reaches the Database:
  - `sqlmcp_test.staff` (not granted);
  - `sqlmcp_test.nosuch` (does not exist);
  - a granted table excluded by `BOUNDARY`;
  - `c.email`, an ungranted column of `customers`;
  - `c.nosuch`, a column that does not exist.
- The critiques' probes each end in the same Refusal whether or not the ungranted column exists:
  - `SELECT email FROM t, (SELECT 1 AS email) s`;
  - `NATURAL JOIN (SELECT 'z'::text AS email) s`;
  - `SELECT 1 AS email FROM t GROUP BY email`;
  - `string_agg(t.id::text, ',' ORDER BY email) AS email FROM t, (SELECT 1 AS email) s`;
  - `row_number() OVER (ORDER BY email)` over the same sources;
  - `SELECT 1 FROM sqlmcp_test.customers c(a, b, x)`, and the same with one alias per listed column;
  - `SELECT j.email FROM (sqlmcp_test.customers c JOIN (SELECT 1 AS email) s ON true) AS j`.
- `SELECT g.n FROM generate_series(1, 3) AS g(n)` runs. A reference to `g.anything_else`, or to a function alias with no column-alias list, is refused.
- `1 OPERATOR(public.===) ANY (SELECT …)` and `ORDER BY c.id USING >` are refused. A user-defined `SECURITY DEFINER` operator's counter shows it never ran.
- A table whose row-level security policy calls a function, as Supabase's `auth.uid()` policies do, can be queried. The rows returned are those the policy allows.
- A granted table `p`, whose policy reads a granted `m`, whose own policy reads a granted `o`, can be queried.
- Every probe in this spec, including each one named in its Critique findings, gives the Agent the same answer, apart from the reference, in two Databases. In one the hidden table or column exists, and in the other it does not. No user-defined function or operator runs in either, as their counters show. The only exceptions are policy functions (D-083), and casts and domain constraints on user-defined column types (D-085). No probe in the suite may use them to tell the two Databases apart.
- A query nested deeper than the parser or the walk can follow, within 64 KiB, is refused as `query_check`, not ended as a fault.
- If Redaction itself fails, the SQL is kept by its length, and a `server_fault` line names the Tool call.
- If the PostgreSQL parser fails to load, the `query` call ends in a Database error of class `other`, with a `server_fault` line that names no detail and one Audit record. The next call loads it again.
- With the account made a superuser, a valid `query` call answers 503 with the misconfigured text and the reference. It writes one `config_invalid` line and one Audit record with outcome `refusal`/`unsafe_account`.
- On a test table with a column `kind` of an enum type:
  - `SELECT m.kind`, `WHERE m.kind = 'shipped'`, `GROUP BY m.kind` and `SELECT m.*` run;
  - its `columns[].type` is `user-defined`.
- With an `AS IMPLICIT` cast from that enum to `text` defined by a function, `SELECT m.kind::text` and `lower(m.kind)` call the cast function, as a counter it increments shows (D-085).
- On a column of a domain whose `CHECK` raises on `'boom'`, `coalesce(t.d, 'boom')` and `ARRAY[t.d, 'boom']` run: PostgreSQL resolves them to the domain's base type, so the constraint is not applied to the Agent's literal (D-086, D-087).
- A cast to the enum type itself (`'x'::public.kind_t`) is still refused, as a cast target outside the allow-list.
- A query over a partitioned table, and over a parent with an inheritance child, returns the descendants' rows and passes. So does a query over a table whose row-level security policy reads a granted table. A query over a table whose policy reads an ungranted table is refused with the plan sentence.
- `SELECT 1/0` and `'2024-13-01'::date` are refused with the plan sentence. `SELECT 1 / (c.id - c.id) FROM sqlmcp_test.customers c` ends in a Database error of class `other`. A query cancelled by `statement_timeout` ends in class `timeout`. Each carries its sentence and the reference.
- No Refusal or Database error text contains any name from the query, or the driver's message.
- A test-only probe over the same connection path shows `transaction_read_only` `on` and `search_path` `pg_catalog` while the query runs.
- With `ROW_LIMIT` 500:
  - a query matching 501 rows returns 500, with `cut_short: true` and the notice;
  - one matching exactly 500 returns 500, with `cut_short: false`.
- With `ROW_LIMIT` 3, a query matching 4 rows returns 3.
- `ROW_LIMIT` `0`, `10001` or `abc`, and `REDACTION` `maybe`, each answer 503 "Deployment misconfigured: <variable>", with no Audit record.
- A `bigint` count, a `numeric(12,2)` total and a `timestamptz` come back as PostgreSQL's text output, unchanged. Their `columns[].type` are `bigint`, `numeric(12,2)` and `timestamp with time zone`, as `list_tables` would name them.
- `SELECT 1::int2, 2::int4, 1.5::float4, 2.5::float8, 'NaN'::float8, 'Infinity'::float8, true, NULL::int4` returns `[1, 2, 1.5, 2.5, "NaN", "Infinity", true, null]`: JSON numbers, strings, a boolean and `null`, as D-082 fixes.
- A connection lost while planning, whether a SQLSTATE `08` error or a socket error such as `EPIPE`, ends in a Database error of class `connection`, not a plan Refusal. A failure after the rows were fetched still records the Statement.
- Called directly, below the Query check, the execution path rejects SQL holding two statements. The Database itself refuses it (SQLSTATE `42601`), as only the extended protocol does, and neither statement runs.
- A 65,536-byte query passes the size layer, and one of 65,537 bytes is refused.
- A `query` call with `request_text` missing, empty or 4,001 characters, or with `sql` missing, empty or not a string, ends in a Refusal of class `invalid_input` with an Audit record. A 4,000-character `request_text` is accepted.
- Every `query` call writes exactly one Audit record, carrying `staff` and the `request_text` as received:
  - a run query has one `statements` entry, with its `rows` and `ms`;
  - a refused one has `submitted_sql` and no `statements`.
- With Redaction on, `SELECT o.id FROM sqlmcp_test.orders o WHERE o.id = 42 AND o.note = 'x'` is logged as `SELECT o.id FROM sqlmcp_test.orders o WHERE o.id = ? AND o.note = ?`. With it off, it is logged exactly as sent. A refused `SELEC 1`, with Redaction on, has `submitted_sql` `<unparsed: 7 chars>`. With Redaction on, `SELECT o.id -- note ann@example.com` keeps no part of its comment, while a quoted identifier containing `--` is kept. `GROUP BY 1 ORDER BY 2 DESC` keeps its ordinals, but `ORDER BY 5551234`, which names no output column, is logged by its length. A string written as a type modifier, as in `'a'::text('ann@example.com')`, is refused by the structural step and never logged. SQL the lexer cannot finish, such as an unterminated literal or comment, is `<unparsed: N chars>`, and its Tool call still leaves one Audit record. A refused `COPY (SELECT 1) TO '/tmp/x'`, `PREPARE p AS SELECT 'x'` and `NOTIFY c, 'x'` each have `submitted_sql` `<unparsed: N chars>`, and none of their literals appears in the record.
- An Audit record whose SQL and Request text would exceed 64 KiB is cut to fit, with `shortened: true`.
- No Audit record holds a value from a result row.
- Live, on the project test Deployment, through Hyperdrive, which the Docker tests do not use:
  - Claude and ChatGPT each answer "how many orders are there per region?" from a `query` call;
  - each, asked to list every order, says the result was cut short;
  - each, asked to read `sqlmcp_test.staff` or to delete an order, gets a Refusal that names nothing;
  - the Audit record of each call is found in Workers Logs, with the Staff member, Request text and redacted SQL.

## Out of scope
- **MS SQL Server's Query check, execution and redaction:** S-007, under D-082's shared contract.
- **The `conversation` input and Created objects:** S-012.
- **Reading `PERMISSION_TIER`:** `query` exists at every tier, so the setting is first read by S-010.
- **Functions and constructs beyond security.md's list,** as amended by D-084. Array subscripts stay refused.
- **Casts to user-defined types:** columns of those types are readable (D-085), but a cast may still only target the built-in allow-list.
- **Measuring answer correctness:** S-004.
- **The overhead target** (operations.md): not measured by this slice.
- **A byte cap on results:** none is set. A wide result at a high Row limit is limited only by the platform.
- **Views and user-defined functions** (D-035, D-038).

## Needs before live verification
`sqlmcp_test.orders` holds at least 501 rows and a `customer_id` that joins to `customers.id`, still owned by `postgres` and granted to `sqlmcp_reader` as S-002 left it. The Worker runs on the Workers paid plan, which the parser's bundle size needs (ADR-005). The descendant, policy and enum cases are covered by the Docker integration tests, not live.

## Tasks

### T-001 — The PostgreSQL parser loads and works inside workerd, within the bundle limit
Verified by: query_parser_parses_and_normalises_in_workerd, worker_bundle_under_10_mib_gzipped

### T-002 — The Row limit and Redaction settings are read and validated
Verified by: row_limit_setting_parsed_and_validated, redaction_setting_parsed_and_validated, invalid_row_limit_or_redaction_answers_503

### T-003 — The structural layer accepts one supported SELECT and refuses everything else
Verified by: query_check_accepts_every_supported_construct, query_check_refuses_writes_and_role_changes, query_check_refuses_more_than_one_statement, query_check_refuses_data_modifying_ctes, query_check_refuses_locking_into_and_tablesample, query_check_refuses_unlisted_functions_and_value_functions, query_check_refuses_system_catalogs, query_check_casts_only_to_listed_types, query_check_refuses_schemas_other_than_pg_catalog, query_check_refuses_unqualified_tables, query_check_accepts_listed_expression_nodes, query_check_accepts_at_time_zone_and_array_constructors, query_check_refuses_unlisted_node_types, query_check_bounds_query_size, deeply_nested_query_refused_as_query_check

### T-004 — Every table and column a query names is a Visible object, and no probe tells hidden from missing
Verified by: hidden_and_missing_tables_refused_alike, hidden_and_missing_columns_refused_alike, boundary_excluded_table_refused, unqualified_columns_natural_and_using_refused, order_by_output_alias_accepted, bare_names_in_aggregate_and_window_order_refused, column_existence_probes_refused_alike, table_column_alias_lists_and_join_aliases_refused, subquery_columns_must_be_output_names, function_columns_only_through_alias_list, star_only_over_fully_visible_tables, query_refusals_never_echo_names

### T-005 — The Agent's SQL names only built-ins, runs user-defined casts only as their owners wrote them, and never looks up a catalog name
Verified by: user_defined_type_columns_readable, user_defined_casts_run_as_written, casts_to_user_defined_types_refused, reg_type_columns_and_domains_refused, reg_and_composite_types_refused_at_any_depth, domain_constraints_not_applied_to_literals, operators_checked_in_sublinks_and_order_using_refused

### T-006 — The plan check accounts for every relation the plan reads
Verified by: plan_accepts_partitions_and_inheritance_children, plan_accepts_policy_tables_of_named_table, plan_follows_nested_policy_tables, policy_functions_run_as_written, policy_reading_ungranted_table_refused, plan_failures_share_one_sentence, constant_folding_error_is_plan_refusal

### T-007 — An accepted query runs read-only and returns at most the Row limit, saying when it was cut short
Verified by: query_runs_read_only_with_pinned_search_path, query_returns_columns_and_rows, query_cut_short_at_row_limit, query_at_exactly_row_limit_not_cut_short, query_values_keep_database_text_form, query_values_follow_shared_json_forms, query_column_types_named_as_list_tables, query_sent_over_extended_protocol, at_time_zone_and_array_constructors_run

### T-008 — A query that fails after it is sent ends in a Database error that names nothing
Verified by: query_execution_error_classed_without_driver_text, query_statement_timeout_is_timeout, plan_step_network_failure_is_connection_error, failure_after_fetch_keeps_statement

### T-009 — The query tool sits beside list_tables, checks its inputs and refuses an unsafe account
Verified by: tools_list_has_query_and_list_tables, query_description_static_with_row_limit, query_requires_request_text_and_sql, query_unsafe_account_answers_503_with_audit, query_engine_load_retried_after_failure

### T-010 — Every query Tool call leaves one Audit record with its SQL, redacted when Redaction is on
Verified by: query_audit_records_statement_rows_and_timing, query_audit_records_submitted_sql_for_refusals, redaction_replaces_every_literal, redaction_off_keeps_sql_as_submitted, unparsed_sql_logged_by_length, non_select_sql_logged_by_length_only, audit_record_capped_at_64_kib, query_audit_never_holds_result_values, redaction_strips_comments, redaction_failure_writes_server_fault_line

### T-011 — A Security reviewer can read what an Agent-written query may do and what it leaves behind
Verified by: manual. `docs/security-material/queries.md` is read against the Security material section above, and every point is present, each pointing to its rule or decision.

### T-012 — Workers Logs' real retention is measured and recorded
Verified by: manual. On or after 2026-10-30, Workers Logs is queried for `type` `audit` over the widest window it offers. The oldest record returned is compared with the first ones written (S-002, 2026-10-22). The retention in days and the date checked go into visibility.md and queries.md.

### T-013 — Live: Claude and ChatGPT answer from rows, and the Operator can trace each answer
Verified by: manual. The product owner asks Claude and ChatGPT the four live questions under Proven by. Each answer is from a `query` call that went through Hyperdrive's extended-protocol cursor path. The list-every-order answer says it was cut short. Both Refusals name nothing. Each call's Audit record is found in Workers Logs, with the Staff member, Request text and redacted SQL. Outcomes and dates are recorded in this spec.

### T-014 — An adversarial probe suite cannot tell a hidden table or column from a missing one
Verified by: hidden_object_probe_suite_answers_identically, probe_suite_never_runs_user_functions
The suite runs against Docker PostgreSQL. Its corpus starts from every probe in this spec, its Critique findings included, and grows with every probe a later review finds. Each probe runs against two fixtures that differ only in whether the hidden table or column exists. The suite compares the Agent's answers apart from the reference, and checks counters on user-defined functions, operators and casts. A probe that later breaks the Query check is added here before it is fixed.

## Critique findings

Gate 1, 2026-10-24, critique in fresh context. Verdict: fail (5 blockers, 7 gaps, 1 nit). PostgreSQL behaviour was checked on the local PostgreSQL 17 container, as a role with column-level grants, inside transactions that were rolled back. `libpg-query` was checked by installing its PG17 builds from npm.

- **blocker — unqualified column names let the Agent find out whether an ungranted column exists.** PostgreSQL resolves names against every column, granted or not, before it checks privileges. So `SELECT email FROM t, (SELECT 1 AS email) s` fails with 42702 (ambiguous) when `t.email` exists and runs when it does not. `NATURAL JOIN (SELECT … AS email)` fails with 42501 or runs, and `GROUP BY <alias>` works the same way, because GROUP BY tries input columns first. "Each sentence depends only on the query's text and the Visible objects" is therefore false for columns, which are Objects under D-035 and R-003. Build will implement the layers as written, and `plan_failures_share_one_sentence` will pass while the leak stays open.
- **blocker — the `reg*` list misses the array types.** `'{crit.hidden}'::pg_catalog._regclass` returns a row for a hidden table and fails with 42P01 for a missing one. `regclass[]` is caught only if the check ignores `arrayBounds`. Build will refuse exactly the eleven names given, and the Agent keeps a way to confirm that a Hidden object exists.
- **blocker — a user-defined cast runs a non-built-in function that no layer sees.** Suppose a Visible table has a column of a user-defined type, and that type's owner has created a cast to `text`. Then `SELECT m::text` calls the cast function. Verified: a `SECURITY DEFINER` cast function returned rows of an ungranted table, and `EXPLAIN VERBOSE` showed only the visible relation. Pinning `search_path` does not help, because casts are looked up in `pg_cast` without regard to schema. An `AS IMPLICIT` cast needs no `::` at all. This contradicts "resolve only to built-ins" and D-038. Build will ship the hole, and nothing under Proven by would catch it.
- **blocker — `SELECT 1/0` cannot end in a Database error.** The planner folds constants, so `EXPLAIN SELECT 1/0` already fails with 22012. Under this spec's own rule, that makes it a plan-layer Refusal, not a Database error. Literal errors such as `'2024-13-01'::date` behave the same way and get the "check its table and column names" sentence. Build will write `query_execution_error_classed_without_driver_text` to the example given. It then either fails or bends the rule that plan-layer failures are Refusals.
- **blocker — Agent-facing contracts that S-007 must repeat are fixed only in this spec.** The Refusal sentences and their `reason_class` mapping, the plan-layer SQLSTATE mapping, the cut-short notice text and the result shape are not in D-082 or Q-033. D-082 says only that the sentences are "fixed". The slice-spec for S-007 reads the system spec and the register, not this spec, so it will word them again, differently, against R-002's "same tools" (cf. D-080 for S-002).
- **gap — the PG17 `libpg-query` package has no normalise.** `libpg-query@17.8.0` exports only `parse` and `parseSync`, with a 1.15 MB wasm file. `normalize`, which produces `… id = $1 AND note = $2` as the Proven by line expects, is in `@libpg-query/parser@17.8.0`, whose wasm file is 2.0 MB. Build will install the package this spec names, find no normaliser, and pick a substitute on its own.
- **gap — the function allow-list uses security.md's names, but the parse tree uses other names.** `trim` parses as `pg_catalog.btrim`, while `substring`, `position` and `extract` are `pg_catalog.*` FuncCalls. `LIKE`/`ILIKE` are the operators `~~`/`~~*`, `coalesce`, `nullif` and `greatest`/`least` are their own node types, and `current_date` is a `SQLValueFunction`. That node also carries `current_user`, `session_user`, `current_schema` and `current_catalog`, none of which are listed. Operators are not limited at all, so one an extension placed in `pg_catalog` would pass. Build will invent the mapping, and either refuse supported constructs (R-006) or admit the whole `SQLValueFunction` node.
- **gap — some Refusals depend on what is hidden, with no decision accepting it.** A query over a parent with a hidden inheritance child is refused, as Proven by requires, and one over a table whose RLS policy reads a hidden table is refused too, because the plan shows that table. Either refusal confirms that a Hidden object exists, which R-003 counts as a leak. It also contradicts the Refusals paragraph and the security-material point that RLS "applies as the Database administrator wrote" it. Build and the security material (T-009) will each settle this on their own, with no D-###.
- **gap — `<unparsed: N chars>` has no unit, and its example is wrong.** `SELEC 1` is 7 characters and 7 bytes, but Proven by expects `<unparsed: 8 chars>`. Build will either fail `unparsed_sql_logged_by_length` or invent a counting rule to reach 8.
- **gap — Proven by has no line for `query`'s `request_text` bound of 1–4,000.** The bound appears only in the Refusals table. T-007's `query_requires_request_text_and_sql` has no line to prove, so build will choose the boundary cases itself.
- **gap — Verified-by and Proven by do not match up.** T-001's `query_parser_loads_in_workerd` and `query_parser_matches_postgres_17_grammar` answer no Proven by line, so build will decide what "matches the grammar" asserts. The line "Worker bundle under 10 MiB gzipped, as `wrangler deploy --dry-run` reports" has no test. T-011 only records the size, from `wrangler deploy`, against no limit.
- **gap — where `columns[].type` names come from is unstated, and the rule differs from the one it cites.** The spec says "OID below 16384 … as D-081 does", but D-081 and `src/engine/postgres.ts` use `typnamespace = pg_catalog`. Information-schema domains have OIDs below 16384. The spec also does not say whether names carry typmods (`numeric(12,2)` from `format_type`, as `list_tables` shows). Build will choose a static map or a catalog lookup, and `query` and `list_tables` may name the same column's type differently.
- **nit — column privileges are checked when the executor starts, which EXPLAIN does, not "when it plans".** Verified: `EXPLAIN` of an ungranted column fails with 42501, so the design holds. As written, though, T-009's `queries.md` would describe the mechanism wrongly to a Security reviewer.

Revision 2, 2026-10-24:

- Column-existence probes → every column must be qualified, and is checked against the Visible columns before anything reaches the Database. `NATURAL` and `USING` joins, bare `GROUP BY` names and whole-row references are refused. Only an `ORDER BY` output alias stays bare. The three probes are tested by name (`column_existence_probes_refused_alike`).
- `reg*` arrays → the `reg*` deny-list is replaced by an allow-list of 17 built-in types for casts and typed literals, with no arrays (`query_check_casts_only_to_listed_types`).
- User-defined casts → columns of non-built-in types cannot be read, and `alias.*` is limited to whole select-list items over fully built-in tables. No value of a user-defined type enters the query, so no user cast or operator can apply (T-005, D-082). The cost to enum and domain columns is raised as Q-034.
- `SELECT 1/0` → constant-folding errors are plan Refusals. The Database error example is now `1 / (c.id - c.id)` (`constant_folding_error_is_plan_refusal`).
- Shared contracts → the result shape, cut-short notice, value forms, Refusal sentences and classes now live in D-082, which S-007 reads. The spec cites them instead of holding them.
- Parser package → `@libpg-query/parser` 17.x, which has `normalize`. Q-033 records the package name and wasm size for ADR-005.
- Parse-tree names → the mapping from security.md's names to parser nodes is written out. Only `current_date` and `current_timestamp` pass as `SQLValueFunction`s. Operators are accepted only unqualified or in `pg_catalog`.
- Hidden-dependent Refusals → partitions, inheritance children and row-level security policy tables of a named table are accepted under its grant. A policy that reads an ungranted table makes its table unqueryable. Both are accepted in D-082 and disclosed in the Security material.
- `<unparsed>` → N is UTF-16 code units, and the example is now 7.
- `request_text` bounds → a Proven by line for `query`.
- Verified-by ↔ Proven by → T-001 now proves parsing and normalising inside workerd, plus a bundle-size test against 10 MiB.
- Column types → named as `list_tables` names them: `pg_catalog` types by `format_type` with their modifier, looked up by a Server statement.
- Nit → privileges are checked when the executor starts, which `EXPLAIN` also does.

Gate 2, 2026-10-24, critique in fresh context. Verdict: fail (1 blocker, 6 gaps, 2 nits). All 13 gate-1 findings are resolved as written, but the `reg*` fix covers only explicit casts, and a `reg*`-typed column is still a lookup route (blocker below). PostgreSQL behaviour was checked on the local PostgreSQL 17 container, as a throwaway role with `search_path` pinned to `pg_catalog`, inside transactions that were rolled back. Parse trees were checked with `@libpg-query/parser` 17.8.0.

- **blocker — a Visible column of a `reg*` type still lets the Agent look up Hidden objects.** The Casts rule (line 43) and D-082 ("so `reg*` lookups are impossible") cover only explicit casts and typed literals. Column types are refused only when they are `user-defined`, and `regclass` is in `pg_catalog`. Verified with a granted table `g2.t(id, r regclass)` and an ungranted `g2.secret`: `SELECT t.id FROM g2.t t WHERE coalesce(t.r, 'g2.secret') = t.r` runs, while the same query with `'g2.nosuch'` fails with 42P01 during parsing, which is a plan Refusal. `… UNION SELECT 'g2.secret'` behaves the same way, because the unknown literal is coerced to `regclass` without any `::`. Plain `SELECT t.r::text` also printed `g2h.secret`, a table in a schema the role has no USAGE on. Every rule in layer 2 passes these queries. Build will implement the rules as written, and nothing under Proven by would catch the leak, which R-003 counts. The rule needs `regclass`, `regtype`, `regproc`, `regprocedure`, `regoper`, `regoperator`, `regnamespace`, `regrole`, `regconfig`, `regdictionary` and `regcollation` columns, and arrays of them, to be unreadable, in the same way as `user-defined` ones, with a Proven by line for each kind of probe.
- **gap — the `ORDER BY` alias exception is true of only one of the three places `ORDER BY` appears.** Line 36 exempts "an `ORDER BY` item that equals exactly one explicit `AS` name of the same SELECT". An aggregate's `ORDER BY` (`FuncCall.agg_order`) and a window's (`over.orderClause`) are the same `SortBy`/`ColumnRef` nodes inside the same SELECT. PostgreSQL resolves both against the input columns, not the output. Verified: `SELECT string_agg(t.id::text, ',' ORDER BY email) AS email FROM g2.t t, (SELECT 1 AS email) s` fails with 42702 when the ungranted `t.email` exists, and plans when the column is missing. `row_number() OVER (ORDER BY email)` behaves the same way. The top-level case (`SELECT t.id AS email … ORDER BY email`) is safe, as the spec says. A build that exempts every matching `SortBy` reopens gate-1's first blocker, and `column_existence_probes_refused_alike` tests only the three old probes. The spec should limit the exception to the SelectStmt's own `sortClause`, as a whole item, and add the two probes.
- **gap — row-level security policies run functions outside `pg_catalog`, which the spec says cannot happen.** Line 45 says "no function outside `pg_catalog` can run". The Security material (line 81, T-011) is to say the same, and D-082 accepts policy *tables* only. Verified: a policy `USING (g2.cnt())` with a `SECURITY DEFINER` plpgsql function ran it, as its owner, inside a `READ ONLY` transaction under the pinned `search_path`. The plan listed only `g2.p`, with `"Filter": "g2.cnt()"`. On Supabase, policies that call `auth.uid()` and similar functions are routine. T-011 will hand a Security reviewer a false guarantee, and build has no decision on whether to refuse such tables or accept them, against D-038. A D-### should record the choice, and the Security material should disclose it.
- **gap — no rule for a column qualified by a subquery or CTE.** Line 35 checks a column against Visible columns only "where the qualifier names a table". It does not say that `s.x` must be one of `s`'s output columns. PostgreSQL reads `s.f`, where `f` is not a column, as the function call `f(s)`. Verified: `SELECT s.row_to_json FROM (SELECT c.id, c.region FROM g2.c c) s` runs `row_to_json`, a function not on the list, and the walk sees only a `ColumnRef`. Build will either leave the hole, which bypasses the function allow-list and R-004's predictability, or invent the rule. No Hidden object was found to leak this way.
- **gap — the expression node types the walk accepts are not listed.** "Accepts only the node types listed here and in security.md's supported constructs" (line 32). Neither document names `NullTest`, `BooleanTest`, `BoolExpr`, `A_Expr` kinds `IN`/`BETWEEN`/`DISTINCT`, or `SubLink` kinds (`EXISTS`, `ANY`, scalar), all of which `IS NULL`, `IN (…)`, `BETWEEN` and `EXISTS` produce (verified in the parse tree). Nor does either say whether `CollateClause`, `A_Indirection`, `RowExpr`, `ParamRef` and `GroupingFunc` are refused. Build will choose. Refusing `IS NULL` or `IN` still passes `query_check_accepts_every_supported_construct`, which tests only security.md's list, and fails R-006 and S-004's benchmark. Accepting too much leaves `query_check_refuses_unlisted_node_types` with nothing defined to test.
- **gap — D-082's value forms have no Proven by line apart from text.** Line 129 proves the text forms of bigint, numeric and timestamptz. Nothing proves that `int2`/`int4`/`float4`/`float8` are JSON numbers, that `NaN` and infinities are strings, or that booleans and `null` are JSON's own. Build can return every value as text and pass `query_values_keep_database_text_form`, while S-007 follows D-082. The same tool then returns different shapes on the two Engines (R-002).
- **gap — four Verified-by names answer no Proven by line.** These are `query_check_refuses_unlisted_node_types` (T-003), `order_by_output_alias_accepted`, `star_only_over_fully_visible_tables` (T-004) and `query_sent_over_extended_protocol` (T-007). Proven by has no line for `*` over a partly granted table, which gets the "name the columns" sentence, and none for the output-alias acceptance. Nothing says what shows the extended protocol was used, so a test that only checks a configuration flag could not fail. Build will decide what each asserts.
- **nit — Proven by refuses "any reference to `pg_catalog`" (line 104), but the Functions, Operators and Casts rules accept `pg_catalog`-qualified names, and `trim` itself parses as `pg_catalog.btrim`.** The line means tables. Similarly, line 29 says "three layers" and then lists four, which line 79 calls "the four layers".
- **nit — line 45's reason for operators is wrong, though the conclusion holds.** `CREATE OPERATOR` on built-in types needs no type ownership. What keeps user operators out is the pinned `search_path` (line 42), not the column and cast rules. `queries.md` (T-011) should give that reason.

Revision 3, 2026-10-24:

- `reg*` columns → columns of the eleven `reg*` types, and arrays of them, are unreadable, like `user-defined` ones. Each probe has a Proven by line (`reg_type_columns_refused`), and D-082 has the Refusal sentence.
- Aggregate and window `ORDER BY` → the bare-name exception holds only as a whole item of the SELECT's own `sortClause`. The two new probes are tested (`bare_names_in_aggregate_and_window_order_refused`).
- Policy functions → trusted like grants, by the product owner's decision (D-083). The spec, D-082 and the Security material now say so, and the Security material asks reviewers to review policy functions. `policy_functions_run_as_written` proves an `auth.uid()`-style policy works.
- Subquery and CTE columns → a reference must name one of the output names the walk can read. Otherwise D-082's new "name every subquery and CTE column" Refusal applies (`subquery_columns_must_be_output_names`).
- Expression nodes → the accepted node types are listed, with examples of refused ones, and Proven by has accept and refuse lines (`query_check_accepts_listed_expression_nodes`).
- Value forms → a Proven by line for numbers, `NaN`, infinities, booleans and `null` (`query_values_follow_shared_json_forms`).
- Unmatched Verified-by names → Proven by lines added for `*` over a partly granted table, the `ORDER BY` output alias, and the extended protocol. The last is shown by the Database refusing two statements sent below the Query check.
- Nits → "any table in `pg_catalog`"; "four steps"; the operator reason now names the pinned `search_path`, in the spec and in D-082.

Gate 3, 2026-10-24, critique in fresh context. Verdict: fail (2 blockers, 3 gaps, 1 nit). All 9 gate-2 findings are resolved as written: `reg*` columns and their arrays are unreadable, the bare-name exception is limited to the SelectStmt's own `sortClause`, policy functions are trusted under D-083 (the spec, D-082 and the Security material agree), subquery and CTE columns must be readable output names, the expression nodes are listed, value forms and the unmatched Verified-by names have Proven by lines, and both nits are fixed. PostgreSQL behaviour was checked on the local PostgreSQL 17 container, as a throwaway role with `search_path` pinned to `pg_catalog`, inside transactions that were rolled back. `normalize` and parse trees were checked with `@libpg-query/parser` 17.8.0.

- **blocker — a column-alias list on a table counts its hidden columns.** The Tables and Columns rules check table names and column references, but say nothing about `Alias.colnames` on a `RangeVar`. `SELECT 1 FROM sqlmcp_test.customers c(a, b, x)` has no column reference, so layer 2 passes it. PostgreSQL then counts every column, granted or not. Verified on a table with two granted columns and one ungranted: three aliases plan and run, while the same three on a table with only two columns fail with "has 2 columns available but 3 columns specified". That is a plan Refusal. The Agent knows the Visible column count from `list_tables`, so one more alias tells it whether a hidden column exists, and repeating it tells it how many. R-003 counts that as a leak. Build will accept the `Alias` node, since every `FROM … o` needs it, and nothing under Proven by would catch the probe. The rule should refuse column-alias lists on table references (subqueries, CTEs and functions keep theirs), with a Proven by line for the probe.
- **blocker — `normalize` leaves literals in statements other than DML and SELECT, so a refused query's `submitted_sql` keeps them with Redaction on.** The Audit record section says `submitted_sql` "is `normalize`'s output". Verified: `COPY sqlmcp_test.orders TO '/tmp/secret-path.csv'`, `PREPARE p AS SELECT 'prep-secret'`, `EXECUTE p('exec-secret')`, `NOTIFY chan, 'notify-secret'`, `COMMENT ON TABLE t IS 'comment-secret'`, `CREATE VIEW v AS SELECT 'view-secret'`, `CREATE TABLE t2 AS SELECT 'ctas-secret'` and `ALTER SYSTEM SET work_mem = 'sys-secret'` all come back from `normalize` with the literal intact. SELECTs, DML, `SET` and `CALL` are redacted. R-011 is unmet "if redaction is on and a literal value appears in a logged statement". Build will log `normalize`'s output as the spec says, and `redaction_replaces_every_literal` tests only a SELECT, so it passes while `COPY` (a Proven by refusal) and `CREATE TABLE AS` (an Agent asked to "save this") leave literals in the log. The spec should say what is logged when the parse tree holds anything but SelectStmts, or when literals survive normalising. Two options: `<unparsed: N chars>`, or the redaction walk checking that no `A_Const` remains. It should also add a Proven by line for one of these statements.
- **gap — no rule for columns qualified by a join alias or a function alias.** The Columns rule covers only a qualifier that "names a table" or "names a subquery or CTE". `JoinExpr` with `ON` is accepted, and its `alias` and a `RangeFunction`'s alias are not mentioned. Verified: `SELECT j.email FROM (sqlmcp_test.customers c JOIN (SELECT 1 AS email) s ON true) AS j` (shape checked on a throwaway table) fails with 42702 (ambiguous) when the ungranted `c.email` exists, and plans when it does not. `j.row_to_json` over a fully granted join runs `row_to_json`, which is not on the list. On the other side, refusing every such reference leaves `generate_series` and `unnest` in `FROM` usable only for `count(*)`. Days with no orders, for example, need `g.d`, against R-006. Build will choose. The plausible choice, "a join alias's columns are its members' Visible columns", reopens gate 1's first blocker and the `s.f` → `f(s)` route. The spec should refuse join aliases or give their columns the subquery rule, give function aliases the output-name rule, and add the `j.email` probe to `column_existence_probes_refused_alike`.
- **gap — operator names outside `A_Expr` are not named, and only `A_Expr` is tested.** The Operators rule is stated generally, but Proven by refuses only `OPERATOR(public.+)`. The parse tree also carries a schema-qualified operator in `SubLink.operName` (`x OPERATOR(s.op) ANY (SELECT …)`) and in `SortBy.useOp` (`ORDER BY … USING OPERATOR(s.op)`). Verified: a user's `SECURITY DEFINER` operator `g3.===`, called as `1 OPERATOR(g3.===) ANY (SELECT 1)`, ran and read a table the role cannot read, under the pinned `search_path`. The pin does nothing for a qualified name. A build that checks operators where the test puts them, in `A_Expr.name`, ships a route by which the Agent's own SQL calls a non-built-in function (D-038), and the Functions-and-operators guarantee T-011 hands a Security reviewer is false. The spec should list `A_Expr.name`, `SubLink.operName` and `SortBy.useOp`, and add a Proven by line for the `SubLink` form.
- **gap — the plan check accounts for policy tables one level deep only.** Layer 3 accounts for "a table that a row-level security policy on one of them reads", where "them" is the named tables and their descendants. PostgreSQL also applies row-level security to the tables a policy reads. Verified: `p`'s policy reads `m`, and `m`'s policy reads `o`, all granted. `EXPLAIN VERBOSE` of `SELECT p.id FROM g3.p p` lists `g3.o`, which the rule does not account for, so a fully granted table is refused. Policy tables that are partitioned, or views a policy reads, would show unaccounted relations the same way (not verified). Supabase policies that check a membership table with its own policy are common. Build will implement the one-level rule. Such tables will get the plan sentence, and D-082 and the Security material will say that only "a policy that reads an ungranted table" makes a table unqueryable. The rule should take the closure: descendants and policy tables of every accounted relation, and a policy-read view's base tables, or else D-082 should accept and disclose the narrower rule.
- **nit — `query_unsafe_account_answers_503_with_audit` (T-009) answers no Proven by line.** The behaviour is stated under Interface ("answers 503 for `query` exactly as it does for `list_tables`") and in D-078, so the test is defined, but it is the one Verified-by name with no line to point to.

Hold for the product owner after three failures (D-029's stop). Answered 2026-10-24: apply the gate-3 fixes, add an adversarial probe suite to the build, and pass on the product owner's word without a fourth critique.

Revision 4, 2026-10-24:

- Column-alias lists → refused on table references. Joins may not carry an alias, and functions in `FROM` expose columns only through their column-alias list. The count probe and the `j.email` probe are added (`table_column_alias_lists_and_join_aliases_refused`, `function_columns_only_through_alias_list`).
- Redaction → `normalize`'s output is logged only for a single `SelectStmt` whose normalised text, re-parsed, holds no `A_Const`. Everything else is `<unparsed: N chars>` (`non_select_sql_logged_by_length_only`).
- Operators → checked in `A_Expr.name` and `SubLink.operName`. `ORDER BY … USING` is refused (`operators_checked_in_sublinks_and_order_using_refused`).
- Nested policies → the plan check follows policy tables, their descendants and policy-read views to the end of the chain (`plan_follows_nested_policy_tables`).
- Nit → a Proven by line for the unsafe-account 503 on `query`.
- Adversarial probe suite → T-014. It covers every probe in this spec and its findings, run against fixtures with and without the hidden object, and grows with each probe a later review finds. It moves the search for the next edge case from paper into tests.

Passed on the product owner's word after revision 4, without a fourth critique.

Amendment gate, 2026-10-25 (D-084, D-085), critique in fresh context. Verdict: fail (1 blocker, 4 gaps, 2 nits) for the slice-spec consistency part. PostgreSQL behaviour was checked on the local PostgreSQL 17 container, as a throwaway role with `search_path` pinned to `pg_catalog`, inside transactions that were rolled back, with the role and schema confirmed gone afterwards. Parse trees were checked with `@libpg-query/parser` 17.8.0: `AT TIME ZONE` and `AT LOCAL` arrive as `pg_catalog.timezone` with two and one arguments, `ARRAY[…]` as `A_ArrayExpr` and `ARRAY(…)` as an `ARRAY_SUBLINK`, as the Functions and Expressions rules say.

- **blocker — the `reg*` rule only checks the column's type at the top level, so composite and range types with `reg*` inside are readable under D-085.** The rule refuses "a `reg*` type, an array of one, or a domain over either". It does not look inside composite fields, range subtypes, or arrays of a domain over `reg*`. Before D-085 every user-defined type was refused, so these cases could not arise. Verified on a granted `c4.t` and an ungranted `c4.secret`:
  - a column of `CREATE TYPE comp AS (r regclass)` reads back as `(c4.secret)`;
  - `ARRAY[t.c, '(c4.secret)']`, `coalesce(t.c, '(c4.secret)')`, `… UNION SELECT '(c4.secret)'` and `ARRAY(SELECT t.c … UNION ALL SELECT '(c4.secret)')` all plan, while the same queries with `c4.nosuch` fail with 42P01, which is a plan Refusal. The unknown literal is converted to the composite type, which looks up the `regclass` field. D-084's array constructor is one of these routes;
  - a column of `CREATE TYPE rr AS RANGE (subtype = regclass)` reads back as `[c4.secret,c4.secret]`. `t.rg = '[c4.secret,c4.secret]'` plans, and with `c4.nosuch` it fails with 42P01;
  - a column of type `dreg[]`, where `dreg` is a domain over `regclass`, reads back as `{c4.secret}`.

  D-085 keeps `reg*` unreadable "because they reveal catalog names", and these types reveal them in the same way. R-003 counts that as a leak. The Casts rule's claim that an array constructor "takes its element type from the values inside, which the other rules already limit" is false here, because the literal takes the column's type. Build will implement the check as written, T-005's `reg_type_columns_and_domains_refused` will pass, and T-014's corpus has no such probe. The rule should look through the type's structure (domains, arrays, composite fields at any depth, range and multirange subtypes) and refuse any type with `reg*` anywhere inside. D-082's Refusal row and the Security material should say the same, and Proven by should gain the composite and range probes.
- **gap — D-085 does not say whether composite types, including the row types of Hidden tables, are readable.** D-085 names "enums, domains and extension types", but the spec reads "other user-defined types" as readable, and that includes composite types. Every table has a row type (D-081). Verified with a column of type `c4.secret`, a table the role is not granted: it reads back as `(7,hidden@x)`. `ARRAY[t.s, '(1,a)']` plans, while `'(1,a,b)'` fails ("malformed record literal"). So the Agent learns how many columns the Hidden table has, and their order and types. Gate 3 treated this kind of column-count leak as a blocker. Build will admit composite columns as written, and the Security material (T-011) will not tell a reviewer. The product owner should decide whether composite types are in D-085's scope, or the rule should refuse them.
- **gap — a domain's CHECK constraint runs on values the Agent supplies, which is not a cast.** Verified: a composite field of a domain whose CHECK calls a `SECURITY DEFINER` function ran that function when a literal was converted to the composite (`ARRAY[t.cd, '(zz)']`, and `coalesce(t.cd, '(zz)')`). Direct comparisons with a domain column did not run it. The spec's "one route only" list, the Security material bullet and Proven by's exception (line 174) name only casts. T-014's `probe_suite_never_runs_user_functions` will flag the function's counter with no stated exception, and `queries.md` will not tell a reviewer to review domain constraints. This needs the D-085 wording ("conversions") carried through as "casts and domain constraints", or the composite rule above should close the route.
- **gap — D-082 still limits `alias.*` to tables whose columns are all built-in.** The spec's line 43 allows it over tables whose columns are "all Visible and readable", and Proven by has `SELECT m.*` running on an enum table. S-007 reads D-082, not this spec, and T-004's `star_only_over_fully_visible_tables` can be written to either rule. D-082 should say "readable".
- **gap — Q-033's owed wording still lists "columns of user-defined types cannot be read" (fourth bullet).** D-085 reverses this. Its fifth bullet adds the D-085 casts, so the list now contradicts itself. Whoever applies the Q-030/Q-033 batch at the next system-spec revision will write the old rule into security.md, against D-085 and this slice's build. The bullet should say that `reg*` columns, their arrays and domains over them cannot be read.
- **nit — `lower(m.kind)` (line 179) calls the cast function only if that cast is `AS IMPLICIT`.** Verified: without `AS IMPLICIT`, `lower(c4.kind_t)` does not exist, which is a plan Refusal. The fixture for `user_defined_casts_run_as_written` should name an implicit cast, or the line should limit itself to `::text`.
- **nit — the `AT TIME ZONE` line (126) needs `o.created_at` to be `timestamptz`, and no fixture says so.** "Needs before live verification" lists only `customer_id`. On a `timestamp` column, `AT TIME ZONE` converts the other way, and the 22:30 UTC example fails.

Revision 5, 2026-10-25, with the product owner's answers ("Refuse composites"; domain CHECK constraints: "Yes, trust them"):

- `reg*` at depth → a column's type is looked through domains, arrays, ranges, multiranges and composite fields at any depth. Any type reaching `reg*` is refused (`reg_and_composite_types_refused_at_any_depth`), with probes for each shape.
- Composites → refused at any depth, table row types included, by the product owner's decision recorded in D-085.
- Domain constraints → trusted with casts under D-085. The spec, the Security material and the probe suite's exception all say so (`domain_constraints_run_as_written`).
- `alias.*` in D-082 → "readable", matching the spec.
- Q-033 → its fourth bullet now matches D-085.
- Nits → the implicit cast is named, and the `AT TIME ZONE` fixture is `timestamptz`.
- The system-spec finding (the T-SQL parser cannot parse `AT TIME ZONE`) is raised as Q-035 for S-007.

Amended after the code review (2026-10-25, docs/slices/S-003/review.md, D-087), by the product owner's answer: fix all eleven gaps, and strip comments under Redaction.
- **Plan-step network errors.** A plan-step failure is classed by `classifyPostgresError`, so `EPIPE` and other socket errors are Database errors of class `connection` (`plan_step_network_failure_is_connection_error`).
- **Failures after the fetch.** These keep the Statement (`failure_after_fetch_keeps_statement`).
- **Comments under Redaction.** They are removed by the lexer before normalising (`redaction_strips_comments`).
- **D-084 against PostgreSQL.** `AT TIME ZONE` and the array constructors now run against PostgreSQL (`at_time_zone_and_array_constructors_run`).
- **The domain-constraint test.** It is renamed `domain_constraints_not_applied_to_literals`, and its Proven by line now says what PostgreSQL does.
- **Restructuring, with no behaviour change:**
  - the PostgreSQL structural layer and Redaction live under `src/engine/`, behind a `QueryEngine` that names its Engine in the parse sentence;
  - `checkQuery` becomes `checkStructure`, `RefusalClass` is a typed union, and a single `SYSTEM_SCHEMA` serves the listing and the Query check;
  - each Tool is one record in the MCP endpoint;
  - the Audit logger takes a list of Statements.

  `reg_and_composite_types_refused_at_any_depth` was re-recorded after its call changed.

Amended after the second code review (2026-10-25, docs/slices/S-003/review.md review 2, D-088):
- **SQL the lexer cannot finish** is `<unparsed: N chars>`. `unparsed_sql_logged_by_length` now covers it end to end.
- **Ordinals** in `GROUP BY` and the SELECT's own `ORDER BY` are kept under Redaction (`redaction_replaces_every_literal`).
- **A failure in the Server's own work** still writes the Audit record. A failed parser load is not cached (`query_engine_load_retried_after_failure`).
- **Line endings** are LF again, with `.gitattributes`.
- **Names and shapes:** one answer shape with a list of Statements, one Request text check, and `queryEngine` as the single name.
- `query_execution_error_classed_without_driver_text` and `reg_and_composite_types_refused_at_any_depth` were re-recorded after their bodies changed.

Amended after the third code review (2026-10-25, docs/slices/S-003/review.md review 3, D-089):
- **Type modifiers** must be whole numbers, both in the structural step and under Redaction (`query_check_casts_only_to_listed_types`, `redaction_replaces_every_literal`).
- **Ordinals** are kept only within the select list.
- **Deep nesting:** a query nested too deep to read is refused (`deeply_nested_query_refused_as_query_check`).
- **Redaction failures** write a `server_fault` line (`redaction_failure_writes_server_fault_line`).
- **Naming a Server fault** in the domain model is raised as Q-036.
