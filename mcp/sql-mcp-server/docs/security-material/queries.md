# Queries: what an Agent-written query may do, and what it leaves behind

This section answers two of R-014's four questions, *what the Agent can run* and *what is logged*, for the SELECTs the Agent writes itself through the `query` tool. It covers what this release does as of slice S-003. What the Agent can see is in [visibility.md](visibility.md).

## In short

- The Agent can run **one read-only SELECT at a time**, over the tables and columns `list_tables` shows. Nothing else reaches the database: no writes, no second statement, no role changes, no settings.
- Every query passes a **Query check** before it is sent, and runs inside a **read-only transaction that is always rolled back** (ADR-005).
- A refused query is told why in a fixed sentence that **never names anything from the query**. A hidden table or column gets exactly the same answer as one that does not exist.
- At most the **Row limit** of rows comes back (500 unless the Operator sets `ROW_LIMIT`, up to 10,000), and the Agent is told when a result was cut short.
- Every query leaves **one Audit record**, holding the SQL with its literal values replaced by `?` unless the Operator turns Redaction off. The Request text is logged as received and is never redacted (R-011).
- The Database account's grants still cap every read. Nothing here can read what the account is not granted.

## The Query check, step by step

1. **Size.** A query over 64 KiB is refused unread.
2. **Structure.** PostgreSQL's own parser (`@libpg-query/parser`, the PostgreSQL 17 grammar) reads the query, and the Server walks the result against an allow-list. Anything not on the list is refused, rather than anything on a list of known dangers being refused (D-082):
   - exactly one SELECT, optionally under `WITH`, and no data-modifying CTE, `FOR UPDATE`/`SHARE`, `INTO` or `TABLESAMPLE`;
   - only the clauses, functions and operators in the system spec's supported constructs (security.md), with `AT TIME ZONE`, `AT LOCAL` and array constructors added by D-084;
   - every table qualified with its schema and on the Agent's Visible objects, and every column qualified with its table or alias and among that table's granted columns;
   - casts only to an allow-list of built-in types (`integer`, `text`, `date`, `timestamptz` and so on), and never to an array type.
3. **Plan.** The database plans the query without running it (`EXPLAIN`). Every table the plan reads must be one the query named, or be read under that table's grant (see "Tables read under another table's grant" below).
4. **Execution.** The query runs inside `BEGIN READ ONLY`, with the search path pinned to `pg_catalog`, through a cursor that fetches one row more than the Row limit, so the query's text is never rewritten. The transaction is always rolled back. Every statement goes over PostgreSQL's extended protocol, which accepts one statement only, as a second guard behind step 2.

PostgreSQL also checks every privilege itself when the query starts, which planning does too. A defect in the check therefore cannot read what the account was not granted.

## Why tables and columns must be qualified

PostgreSQL resolves names before it checks privileges. A bare column name next to a subquery with a column of the same name fails as ambiguous when the ungranted column exists, and runs when it does not. The same is true of `NATURAL` joins, `JOIN … USING`, column-alias lists on tables (`orders o(a, b, c)`), aliases on joins, and bare names in `GROUP BY`, `DISTINCT ON`, window clauses and an aggregate's own `ORDER BY`. Each of these is refused. Requiring `schema.table` and `alias.column` means the Server decides every name against the Visible objects before the database sees it. The one bare name allowed is an item of the query's own `ORDER BY` that equals one of its explicit `AS` names, which PostgreSQL always resolves to that output column.

A column of a subquery or CTE must be one of the names its text gives it. PostgreSQL would otherwise read `s.f`, where `f` is not a column, as the function call `f(s)`.

## Which types queries cannot read

Some column types are refused because their values look names up in the catalog, or reveal the shape of another table:
- the `reg*` types (`regclass`, `regtype` and the rest), arrays of them, and domains over them. A `regclass` value converts a literal like `'sales.payroll'` into a table reference, which would confirm the table exists, and prints table names;
- any composite type, at any depth, including the row type every table has. A composite reveals the number, order and types of its fields, which for a hidden table's row type is that table's shape.

The Server finds these by following each column's type through domains, arrays, ranges and composites. Columns of enums, domains and extension types that reach neither are readable (D-085). `list_tables` still lists the refused columns. A query that reads one gets "it reads a column of a type that queries cannot read".

## What runs that is not the Agent's own SQL

The Agent's SQL can name only built-in functions, operators and cast targets:
- **Operators** resolve only in `pg_catalog`, because the search path is pinned there, and an operator written as `OPERATOR(schema.op)` must name `pg_catalog`.
- **Functions** must be on the allow-list, and resolve under the same pinned search path.
- **Casts** may target only the built-in allow-list.

Whatever a superuser installs into `pg_catalog`, such as an extension's operators or casts between built-in types, is trusted like the built-ins.

Two things the database administrator writes do run inside an Agent's query, and are **trusted like grants**:
- **Row-level security policies** on a Visible table run as written, along with every function they call, `SECURITY DEFINER` ones included (D-083). Supabase policies calling `auth.uid()` work as they do for any other client.
- **Casts and domain `CHECK` constraints on user-defined column types.** A column of an enum, domain or extension type brings its type's casts with it, implicit ones included, and they run as their owner wrote them, `SECURITY DEFINER` included (D-085). In practice, PostgreSQL resolves the Agent's literals next to a domain column to the domain's base type, so a domain's `CHECK` does not run on them.

**A reviewer should review these as part of the grants.** Any function a policy calls, and any cast or domain constraint on the type of a Visible column, can do whatever its owner allowed. This is a weaker guarantee for casts than for policies, because types are created far more casually.

## Tables read under another table's grant

PostgreSQL reads some tables under the grant of the table a query names. The Server accepts the following, even when they are outside the Boundary (D-082):
- a partitioned table's partitions;
- an inheritance parent's child tables;
- the tables a row-level security policy on a named table reads, the tables their own policies read, and the tables of views those policies read.

A Visible table whose policy reads a table the account is not granted cannot be queried at all. Every query over it gets the same planning Refusal, which tells the Agent the table is unusable, never what it depends on.

## What the Agent is told when a query is refused

Each Refusal is one fixed sentence (D-082), ending with a reference to the Audit record:
- the sentences depend only on the query's text and on what `list_tables` shows: Visible tables, Visible columns, whether every column is granted (`all_columns`), and column types;
- a table or column that is hidden reads exactly as one that does not exist;
- every failure while planning shares one sentence, so an ungranted column, a missing one and a type error cannot be told apart.

The adversarial probe suite (`test/query/probe.int.test.ts`) runs every probe the design reviews found against two databases that differ only in whether a hidden table and column exist, and requires identical answers.

One thing `list_tables` already discloses: `all_columns: false` tells the Agent that a table has at least one column it cannot read, without naming it. `SELECT *` over such a table is refused for that reason.

## Rows, and the cut-short notice

A query returns at most the Row limit of rows. When more match, the result says `cut_short: true`, and its text ends "The result was cut short at the Row limit of N rows; more rows match." The Server cannot make the AI tool pass that notice on to the person asking (J-004).

Values come back as JSON for booleans, small integers and floats, and as PostgreSQL prints them for everything else, so totals, large counts and timestamps are exact. **Every row returned is sent to the AI provider** that runs the Agent, Anthropic or OpenAI, under the organisation's agreement with them (D-036).

The Server sets no time limit on a query (D-003). The database's own `statement_timeout`, if the database administrator sets one for the account, ends a long query, and the Agent is told "The database stopped the query before it finished."

## What a query's Audit record holds

In addition to what every Audit record holds (visibility.md):

| holds | never holds |
|---|---|
| the Statement that ran: its SQL, the rows returned, and the time from the cursor's opening to its last fetch | any value the query returned, or its column names |
| for a refused query, the SQL as submitted | the database driver's error text |
| the outcome: answered (with its row count and whether it was cut short), refused (with its class), or database error (with its class) | |

With Redaction on, the default, every literal in logged SQL becomes `?`. `WHERE o.id = 42 AND o.note = 'x'` is logged as `WHERE o.id = ? AND o.note = ?`. Only a single SELECT is logged that way: anything else, such as a refused `COPY`, `PREPARE` or `CREATE TABLE … AS`, and anything that does not parse, is logged as `<unparsed: N chars>`, because PostgreSQL's normaliser keeps literals in some statement types. The Request text is never redacted: if the person typed a customer's name into their question, it is in the record.

A record is at most 64 KiB. Longer SQL is cut, marked `…[cut]`, and the record says `shortened: true`.

## Retention

As for every Audit record (visibility.md): Workers Logs keeps **3 days on the Free plan and 7 on Paid**, per Cloudflare's documentation. The project measures the real figure on its own Deployment on or after 2026-10-30 (S-003, T-012), and records it here and in visibility.md.
