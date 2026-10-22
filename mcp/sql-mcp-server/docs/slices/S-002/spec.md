# S-002 — Seeing which tables are available

Delivers: a signed-in Staff member asks their AI tool what data it can reach and is told exactly the tables and columns the Database administrator has granted, inside the Boundary, and nothing more. A grant or revoke shows on the very next question, with no redeploy and no reconnect, and every such question leaves an Audit record naming who asked.
Traces: J-003, R-003, R-010, R-017

## Screens
None: the Server has no interface of its own (D-046). What the Staff member sees is their AI tool's rendering of the `list_tables` result.

## Interface
One tool, `list_tables`, registered at every Permission tier. It replaces S-001's empty `tools/list` placeholder.

```
list_tables
  description (static, names no Object): "Lists the tables and columns you may query in this
    database. Pass request_text: the Staff member's question in their own words."
  input:  request_text  string, 1–4,000 characters, required (ADR-011)
          schema        string, 1–128 characters, optional; narrows the listing to one schema
  result: { tables: [ { schema, table, columns: [ { name, type } ], all_columns: bool } ],
            complete: bool }
```

- `all_columns` is true when every column of the table is granted. When it is false, the Agent should not write `SELECT *`.
- Tables are sorted by schema and then table, in code-point order applied by the Server, not by the Database's collation. A partitioned table is listed once, as its parent; its partitions are not listed.
- `complete` is false when the listing stopped at 500 tables. The Agent can then narrow it with `schema`.
- A `schema` that is hidden or does not exist gives the same empty listing (D-005).
- `request_text` is validated by the tool itself, not by the SDK's schema check, so a missing or oversized value still ends in a Refusal with an Audit record (R-010).

## Visibility
The Visibility resolver (components.md) reads the Allow-list as ADR-006 and D-075 to D-077 describe. On PostgreSQL that is one catalog Server statement per Tool call:
- user tables (`relkind` `r` or `p`, excluding partitions, which have `relispartition`) in non-system schemas on which the role has `USAGE` (`has_schema_privilege`). A table in a schema without `USAGE` cannot be queried, so it is not on the Allow-list;
- each column with `has_column_privilege(…, 'SELECT')`, and its type from `format_type` when the type is built in (`pg_catalog`), or `user-defined` otherwise (D-081);
- excluding tables owned by any role the account is a member of, with or without inherited rights (`pg_has_role(current_user, relowner, 'MEMBER')`). Ownership passes every privilege check or is a `SET ROLE` away, so a revoke could not hide such a table (D-076, D-081);
- joined to one row of the account flags D-081 defines: membership of any superuser or `BYPASSRLS` role, of `pg_read_all_data` or `pg_write_all_data`, `CREATEROLE`, and a superuser `session_user`.

The result is then narrowed by the Boundary. With `BOUNDARY` set, a table is visible only if its schema is in `schemas` (matched exactly) and the table is not in `exclude` (matched ignoring letter case, D-081). With `BOUNDARY` unset, nothing is excluded.

## Account check
The check runs only for `tools/call`: `initialize`, `tools/list` and the other MCP methods never touch the Database. A `tools/call` first validates its inputs (`request_text`, `schema`), which needs no Database, and then runs the resolver's statement. If any bypass flag is true, the request answers 503 "Deployment misconfigured: Database account bypasses grants (reference <id>)", where `<id>` is the Audit record's `id`. The request writes `config_invalid` (`variable`: `HYPERDRIVE`) and an Audit record whose outcome is a Refusal of class `unsafe_account` (D-078). `/healthz` runs the same flags query and answers 503 `{ "status": "degraded", "database": "unsafe" }`.

## Audit record
This slice writes the first Audit records, in the format data-model.md defines, one JSON line per Tool call on standard output, with these values:
- `request_text` is stored as received. A missing value is stored as `null`. One over 4,000 characters is stored as its first 4,000 characters followed by `…[cut]`, with `shortened` set to true.
- `tool` is `list_tables`, and `inputs` is `{ schema }` when given. A schema name is an identifier, so Redaction leaves it.
- `statements` is `[]`, because the listing runs only Server statements (D-026, D-078).
- `outcome.row_count` is the number of tables listed, and `outcome.cut_short` is true when `complete` is false.
- `conversation_objs` is `[]` (Created objects arrive with S-012).

No Audit record is written for `initialize`, `tools/list` or any other MCP method that is not a Tool call. Nothing from the listing itself, no table or column names, is written to the record.

## Operational log lines
`config_invalid` with `variable` `BOUNDARY` (unparseable JSON, or `schemas`/`exclude` of the wrong shape) or `HYPERDRIVE` (the account bypasses grants), in the D-068 envelope. An invalid `BOUNDARY`, like every setting that misconfigures the whole Deployment, is caught before any MCP method runs. It is not a Tool call and leaves no Audit record (D-080).

## Database errors
A failed catalog statement ends the Tool call in a Database error, classed and worded as D-080 fixes for every slice. The Agent gets the class's sentence and the Audit record's `id` as a reference, never the driver's message (D-005). Refusals carry the same reference.

## Security material
This slice writes `docs/security-material/visibility.md` (D-067). It covers:
- what the Agent can see, and how the Database administrator controls it with grants, with examples for PostgreSQL;
- the account check and the roles it refuses;
- that system catalogs are never visible;
- the Boundary as an extra exclusion;
- what an Audit record holds and never holds;
- Audit record retention as the Host's (D-052), including Workers Logs' fixed window;
- that the Allow-list is only as narrow as the grants given (D-074), including grants to `PUBLIC`, which count;
- that views and functions are never listed (D-035), so granting a view shows nothing;
- that a Database account which is a member of a table-owning role cannot see those tables, and why.

## Proven by
- `tools/list` returns exactly one tool, `list_tables`, at every Permission tier, and its description contains no Object name.
- `list_tables` returns exactly the tables and columns `sqlmcp_reader` is granted:
  - a table with only some columns granted lists only those, with `all_columns: false`;
  - an ungranted table, an ungranted column, any `pg_catalog`/`information_schema` table, a table the role owns, a table owned by a role the role is a member of, and a table in a granted-SELECT schema where the role lacks `USAGE` are all absent;
  - a partitioned table appears once, without its partitions.
- After `GRANT SELECT` on a table, the next `list_tables` call includes it. After `REVOKE`, the next call omits it. No restart, redeploy or reconnect happens in between.
- `BOUNDARY` `{"schemas":["sqlmcp_test"],"exclude":[["sqlmcp_test","staff"]]}` hides `staff` even though it is granted, and hides every other schema. With `BOUNDARY` unset, every granted table is listed.
- An invalid `BOUNDARY` makes MCP requests answer 503 "Deployment misconfigured: BOUNDARY", writes `config_invalid`, and writes no Audit record (D-080).
- With the role made a superuser, given `BYPASSRLS`, or made a member of `pg_read_all_data`, each in turn:
  - a `list_tables` call answers 503 with the misconfigured text;
  - it writes one `config_invalid` line and one Audit record with outcome `refusal`/`unsafe_account`;
  - `/healthz` answers 503 with `database: unsafe`;
  - Sign-in metadata still answers 200, and `initialize` and `tools/list` still answer normally;
  - a `tools/call` with an invalid `request_text` is refused as `invalid_input` before the check runs.
- A `schema` argument naming a hidden schema and one naming a nonexistent schema return identical results.
- With 501 visible tables, the listing returns the first 500 in code-point order of schema then table, with `complete: false`. Its Audit record has `row_count` 500 and `cut_short` true.
- A missing, empty, or 4,001-character `request_text`, or a `schema` of 129 characters, ends in a Refusal of class `invalid_input` with an Audit record. A 4,000-character `request_text` and a 128-character `schema` are accepted.
- Every `list_tables` call writes exactly one Audit record. It carries `staff` `{sub, name, iss}` from the Sign-in and the `request_text` as received, with `statements: []`. It contains no table or column name from the result, and no token. `initialize` and `tools/list` write none.
- A Database that refuses the connection ends the call in a Database error of class `connection`. The Agent's message is D-080's sentence followed by " (reference <id>)", where `<id>` is that Tool call's Audit record `id`. Every Refusal message carries the same reference.
- Live, on the project test Deployment with Hyperdrive caching off:
  - Claude and ChatGPT each list the granted `sqlmcp_test` tables;
  - after the Database administrator revokes one table in Supabase, the next question no longer shows it;
  - the matching Audit record appears in Workers Logs.

## Out of scope
- **MS SQL Server's resolver and account check:** these come with S-006.
- **Created objects in the listing** (S-012, D-076, Q-029). Owned tables are simply excluded here.
- **Reading rows:** S-003.
- **Different Allow-lists per group** (D-074 consequence).

## Needs before live verification
The `sqlmcp_reader` role on the AI Golf App Supabase project, with test tables in `sqlmcp_test` owned by another role. The Hyperdrive config is pointed at that role with caching off (T-007, D-079). The role's password is a secret: whoever creates the role types it into Supabase and into `wrangler hyperdrive update`, and never into a message.

## Tasks

### T-001 — The Boundary setting is read, validated and applied
Verified by: boundary_setting_parsed_and_validated, invalid_boundary_answers_503, boundary_exclusion_ignores_letter_case

### T-002 — The Allow-list is read from PostgreSQL's grants on every Tool call
Verified by: resolver_lists_granted_tables_and_columns, resolver_hides_ungranted_tables_and_columns, resolver_excludes_system_schemas_and_owned_tables, resolver_excludes_tables_owned_through_role_membership, resolver_requires_schema_usage, resolver_lists_partitioned_table_once, resolver_hides_names_inside_column_types, resolver_hides_tables_owned_through_noinherit_membership, resolver_applies_boundary, resolver_sees_grant_and_revoke_immediately

### T-003 — An account that bypasses grants is refused on every Tool call, and /healthz says so
Verified by: bypass_check_refuses_superuser_bypassrls_and_read_all_data, unsafe_account_answers_503_with_audit_and_op_line, healthz_reports_unsafe_account, account_check_only_on_tool_calls_after_input_validation, bypass_check_follows_role_membership_and_session_user, unsafe_op_line_names_tool_call

### T-004 — list_tables lists exactly the Visible objects
Verified by: list_tables_registered_alone_with_static_description, list_tables_returns_visible_objects, list_tables_schema_filter_never_confirms_hidden, list_tables_caps_at_500_tables, list_tables_requires_request_text, list_tables_bounds_schema_input

### T-005 — Every Tool call leaves exactly one Audit record, and nothing else does
Verified by: audit_record_written_once_per_tool_call, audit_record_fields_and_staff_identity, audit_record_never_holds_listing_or_tokens, no_audit_for_initialize_or_tools_list, no_audit_for_misconfigured_deployment, audit_inputs_bounded_and_catalog_read_timed

### T-006 — A failing catalog statement ends in a Database error that names nothing
Verified by: database_error_rebuilt_from_class_without_names, refusals_and_errors_carry_audit_reference

### T-007 — The test Database has a dedicated role, and Hyperdrive uses it without caching
Verified by: manual. In Supabase, `sqlmcp_reader` exists with LOGIN and none of the D-077 bypass flags. `sqlmcp_test` holds `orders`, `customers` and `staff`, owned by `postgres`. The role is granted SELECT on `orders`, on `customers (id, name, region)`, and USAGE on the schema. `npx wrangler hyperdrive get eb6eadef54d546ae84c12c419a4c2d9f` shows the role as user and caching disabled. `npm run smoke` passes against the deployed Worker.

### T-008 — A Security reviewer can read what the Agent can see and what is logged
Verified by: manual. `docs/security-material/visibility.md` is read against the Security material section above, and every point is present, each pointing to its rule or decision.

### T-009 — Live: listing from Claude and ChatGPT follows the Database administrator's grants
Verified by: manual. The product owner asks Claude and ChatGPT which tables they can query. Each answer lists `orders` and the three `customers` columns, and nothing else. After `REVOKE SELECT ON sqlmcp_test.orders FROM sqlmcp_reader`, the next question omits `orders`. The Audit record for each question is found in Workers Logs. Outcomes and dates are recorded in this spec.

## Critique findings

Gate 1, 2026-10-21, critique in fresh context. Verdict: fail (3 blockers, 4 gaps, 2 nits).

- **blocker — owned tables are matched only on direct ownership.** A member of an owning role inherits ownership, so `has_column_privilege` is true and a revoke cannot hide the table.
- **blocker — the mapping from PostgreSQL error code to class is decided here with no D-###.** S-003 and S-007 need the same mapping, `constraint` has no code, and there are no fixed sentences.
- **blocker — a Tool call refused for an invalid `BOUNDARY` leaves no Audit record,** unlike the unsafe-account refusal.
- **gap — schema `USAGE` is not part of the Allow-list,** so a table granted without `USAGE` on its schema is listed but cannot be queried.
- **gap — the Audit record's `cut_short` and `id` are unspecified,** and data-model.md says the `id` is returned to the Agent.
- **gap — which MCP methods the account check covers, and its order against `request_text` validation, are unstated.**
- **gap — the Security material misses `PUBLIC` grants, views never being listed (D-035), and membership of an owning role.**
- **nits —** the `schema` input has no length rule; the sort order depends on collation; partition children count separately.

Revision 2, 2026-10-21:

- Inherited ownership → tables owned directly or through role membership are excluded (`pg_has_role … 'USAGE'`), tested by `resolver_excludes_tables_owned_through_role_membership`.
- Error classes → fixed system-wide in D-080: codes, sentences, and an Audit reference on every error and Refusal.
- Invalid `BOUNDARY` → a Deployment-wide misconfiguration, not a Tool call, so no Audit record (D-080), tested by `no_audit_for_misconfigured_deployment`.
- Schema `USAGE` → required for a table to be on the Allow-list (`resolver_requires_schema_usage`).
- `cut_short` and `id` → `cut_short` follows `complete`, and the `id` is the reference in every message (`refusals_and_errors_carry_audit_reference`).
- Account check → only on `tools/call`, after input validation (`account_check_only_on_tool_calls_after_input_validation`).
- Security material → adds `PUBLIC` grants, views never listed, and membership of an owning role.
- Nits → `schema` is 1–128 characters (`list_tables_bounds_schema_input`); the sort is the Server's code-point order; partitions are not listed (`resolver_lists_partitioned_table_once`).

Gate 2, 2026-10-21, critique in fresh context. Verdict: hold (0 blockers, 2 gaps). All gate-1 findings confirmed resolved.

- **gap — the unsafe-account 503 carried no reference,** although D-080 gives every Refusal one.
- **gap — the stored `request_text` for a missing or oversized value was unstated.**

Hold resolved by the product owner, 2026-10-21: the 503 ends with the reference; a missing `request_text` is stored as `null`, and an oversized one as its first 4,000 characters plus `…[cut]` with `shortened: true`. Passed on the product owner's word, without a third critique.

Amended after the code review (2026-10-22, D-081): the account check follows role membership, `CREATEROLE` and `session_user`; ownership counts membership without inherited rights; only built-in types are named; Boundary exclusions ignore letter case; Audit inputs are bounded and timed from the catalog read; and the `config_invalid` line names the Tool call. Six tests were added, each recorded failing first. Two review nits were accepted: the sort compares UTF-16 code units, and a batched `tools/call` from an unsafe account answers 200 with an audited refusal.
