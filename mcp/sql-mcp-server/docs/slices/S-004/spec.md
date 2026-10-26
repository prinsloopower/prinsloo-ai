# S-004 — Measuring answer correctness on PostgreSQL

Delivers: anyone with a Staff member's sign-in and an Anthropic API key can run one command that puts the benchmark's 40 Questions to the deployed Server through Claude Sonnet 5.5. The command writes a run report stating the share answered correctly and the share given up after three refused queries, the two figures the PRD's correctness metrics read.
Traces: R-012

## Screens
None (D-046). The run report is a file, read in an editor or on GitHub.

## Interface

```
npm run benchmark -- <deployment-url>      e.g. https://sql-mcp-server.prinsloopower.workers.dev
  needs:   ANTHROPIC_API_KEY (or an `ant auth login` profile); a browser for the first Sign-in
  writes:  bench/reports/<UTC date>-claude-sonnet-5-5.json and .md
  exit:    0 when the run completed, whatever the score; non-zero when it could not run
```

The harness is its own MCP client (D-091). For each Question it does the following:
1. It signs in as a Staff member through the Deployment's own Sign-in broker (ADR-004), as an AI tool does. It registers by stateless dynamic registration, with a plain-http loopback redirect URI on any port (D-072), and uses PKCE. The Staff member signs in to the Identity provider once, in a browser. The Refresh token is kept in `bench/.signin.json`, which is gitignored, so later runs within its 30 days need no browser.
2. It reads the tools from `tools/list` and offers them to the model as they are. Their names, descriptions and input schemas are passed through unchanged, so the model sees what Claude and ChatGPT see.
3. It sends the Question to `claude-sonnet-5-5` through the Claude Messages API with `@anthropic-ai/sdk`, in a manual tool-use loop:
   - `tool_choice` `auto`;
   - adaptive thinking, at effort `high`;
   - `max_tokens` 16,000;
   - no refusal fallbacks (D-092);
   - one fixed system prompt (below), which with the tool list is cached across Questions.

   Each `tool_use` block goes to the Server as `tools/call`, and the result comes back as a `tool_result`, with `is_error` set from the MCP result.
4. It ends the Question when the model stops calling tools, when the model's third Agent-written query is refused (D-042), after 20 model turns, or on a model refusal (`stop_reason` `refusal`).

The system prompt is fixed, holds no Semantic model (D-034, D-037), and names nothing in the sample Database:

> You answer a Staff member's question about their organisation's data, using the tools you have. When you have the answer, end your reply with one line of the form `ANSWER: <value>`. For a number, give the number alone, with no units, no thousands separators and no percent sign. For several values, separate them with commas. For values by group, write `name=value` pairs separated by commas. If the data needed is not available to you, write `ANSWER: UNAVAILABLE`.

The Question itself is sent as the user message, exactly as written in the question set.

## Data

### The sample Database
`bench/sample-db.sql` rebuilds schema `sqlmcp_test` as a small sales Database, deterministically: no `random()` and no clock, so every rebuild is identical and so is every expected answer. It replaces the S-002/S-003 fixture tables (D-092):

| table | columns | granted to `sqlmcp_reader` | rows |
|---|---|---|---|
| `regions` | `id`, `name` | all | 4: North, South, East, West |
| `customers` | `id`, `name`, `region_id`, `segment` (enum `retail`/`wholesale`), `joined_on` date, `email` | all but `email` | 60 |
| `products` | `id`, `name`, `category`, `unit_price` numeric(10,2), `active` bool | all | 25 |
| `orders` | `id`, `customer_id`, `placed_at` timestamptz, `status` (enum `pending`/`shipped`/`cancelled`/`returned`) | all | about 1,200, from 2025-01-01 to 2026-03-31 |
| `order_lines` | `order_id`, `product_id`, `quantity` int, `unit_price` numeric(10,2), `discount` numeric(4,2) | all | about 3,000 |
| `targets` | `region_id`, `year`, `quarter`, `revenue_target` numeric(12,2) | all | 20 |
| `staff` | `id`, `name`, `salary` numeric(10,2) | none | 5 |

Everything is owned by `postgres`, with `USAGE` on the schema granted to `sqlmcp_reader`. Revenue is `quantity × unit_price × (1 − discount)` over a shipped order's lines. The Questions say so where a Staff member would.

### The question set
`bench/questions.json` holds 40 Questions. Each has:
- an `id` (`B-01` to `B-40`) and the Question's text;
- an answer type: `integer`, `number`, `text`, `list`, `map` or `unavailable`;
- the expected answer;
- the reference SQL that computes it from the sample Database, which the integration test runs.

The set is listed in the appendix for review at this spec's gate.

### Judging
The Judge reads the last `ANSWER:` line of the model's final reply and compares it with the expected answer:
- **`integer`:** exact.
- **`number`:** within 0.5% of the expected value, or 0.01 of it when the expected value is under 2.
- **`text`:** equal ignoring case, surrounding spaces and a trailing full stop.
- **`list`:** the same set, compared as `text` item by item, in any order.
- **`map`:** the same keys, compared as `text`, each value compared as `number`.
- **`unavailable`:** the literal `UNAVAILABLE`.

A reply with no `ANSWER:` line is incorrect. A Question ends in one of four ways:
- **correct;**
- **incorrect;**
- **given up:** the third refused query (D-042);
- **error:** a model refusal, the turn cap, or an API failure.

Only correct counts toward correctness, and only given up toward the give-up share.

### The run report
The JSON form holds one row per Question:
- its outcome, the `ANSWER:` value given and the expected value;
- the counts of `query` and `list_tables` calls, and of refused queries;
- the model's input, output and cache-read tokens;
- its duration.

It also holds the totals, the correctness share and the give-up share, and what a rerun needs:
- the Deployment URL, and the Server name and version from `initialize`;
- the model id, effort and system prompt;
- the harness's git commit;
- the question set's SHA-256;
- the date and time of the run.

The `.md` form is the same, as a table and a summary. Neither holds a Sign-in, a Refresh token or an API key, and neither holds any Audit record field.

## Proven by
- **Seed and expected answers:**
  - running `bench/sample-db.sql` twice against Docker PostgreSQL 17 gives byte-identical table contents;
  - every Question's reference SQL, run as a superuser on that Database, returns the expected answer stored for it, judged by the Judge's own rules.
- **The question set:**
  - holds exactly 40 Questions, `B-01` to `B-40`, each with a text, an answer type, an expected answer and reference SQL;
  - each `unavailable` Question asks only for `customers.email` or `staff`, which `sqlmcp_reader` is not granted.
- **The Judge:**
  - `ANSWER: 1234.56` matches 1,234.56 and 1,238;
  - it rejects 1,241;
  - `ANSWER: north` matches `North`;
  - `ANSWER: b, a` matches the list `a, b`;
  - `ANSWER: North=10, South=20.05` matches the map `{North: 10, South: 20}`;
  - only the last `ANSWER:` line counts;
  - a reply with none is incorrect.
- **Against a fake model and a fake Server:**
  - the harness offers exactly the tools `tools/list` returned;
  - it forwards each `tool_use` with its input unchanged, and returns each result with `is_error` as the Server set it;
  - it ends a Question as given up on the third refused `query` call, and makes no further model call for it;
  - it ends a Question as an error after 20 model turns, and on a `refusal` stop reason.
- **The run report:**
  - its totals equal the counts of its rows;
  - correctness is correct ÷ 40 and give-up is given up ÷ 40;
  - it names the model id, effort, Deployment URL, Server version, harness commit and question-set hash;
  - it holds no string from the Sign-in cache or `ANTHROPIC_API_KEY`.
- **Sign-in:**
  - against the app with a fake Identity provider, the harness registers a loopback redirect URI, signs in with PKCE S256, and calls `tools/list` with the resulting Sign-in;
  - a second run uses the cached Refresh token, with no browser step;
  - `bench/.signin.json` is listed in `.gitignore`.
- **Live, on the project test Deployment** (version as deployed for the run), with the sample Database applied:
  - one full run with `claude-sonnet-5-5` completes all 40 Questions;
  - its report is committed under `bench/reports/`;
  - its correctness and give-up figures are recorded in this spec.

  A correctness below 90% (D-045), or a give-up share above 5% (PRD), is raised as a Q-### naming the Questions that failed. It does not fail the slice, which delivers the measurement.

## Out of scope
- **MS SQL Server's benchmark run:** S-008.
- **Other AI tools and models:** one model per release (D-037). Rerunning with another model id is possible from the command line, but this iteration's report names `claude-sonnet-5-5`.
- **Running the benchmark in CI on every change:** each run spends API credit and needs a Staff member's Sign-in.
- **The visibility, tier-matrix, sign-in and audit test runs** that the Release test harness also holds (components.md): later slices.
- **Semantic models** (D-034).

## Needs before live verification
An Anthropic API key for whoever runs it. The sample Database applied to `sqlmcp_test` in the AI Golf App Supabase project, with its grants. The Staff member's Entra account. A run costs API credit: about 40 Questions of a few model turns each, which will be measured and recorded in the first report.

## Tasks

### T-001 — The sample Database rebuilds identically, and every reference SQL gives its expected answer
Verified by: benchmark_seed_is_deterministic, reference_sql_yields_expected_answers

### T-002 — The question set is well formed
Verified by: question_set_is_well_formed

### T-003 — The Judge decides each answer by its type
Verified by: judge_numbers_within_tolerance, judge_text_lists_and_maps, judge_reads_last_answer_line, judge_missing_answer_line_is_incorrect

### T-004 — The harness puts each Question to the model with the Server's own tools, and ends it as D-042 and the caps say
Verified by: harness_offers_tools_from_tools_list, harness_forwards_calls_and_results, harness_gives_up_after_three_refused_queries, harness_caps_turns_and_records_refusals

### T-005 — The run report states correctness and give-up, and what a rerun needs, and holds no secret
Verified by: report_totals_and_metadata, report_holds_no_tokens_or_keys

### T-006 — The harness signs in through the Server's broker, and reuses its Refresh token
Verified by: harness_signs_in_with_loopback_and_pkce, harness_reuses_cached_refresh_token, signin_cache_is_gitignored

### T-007 — The sample Database is applied to the project test Database
Verified by: manual. In the AI Golf App Supabase project, `bench/sample-db.sql` is run as `postgres`. `sqlmcp_test` then holds the tables and row counts above. `list_tables` as `sqlmcp_reader` lists every table but `staff`, and every `customers` column but `email`.

### T-008 — The first live run is made and its figures recorded
Verified by: manual. `npm run benchmark -- https://sql-mcp-server.prinsloopower.workers.dev` completes all 40 Questions. Its report is committed under `bench/reports/`, and its correctness share, give-up share and cost are recorded in this spec, with a Q-### for any target missed.

### T-009 — Anyone can rerun the benchmark from the docs alone
Verified by: manual. `bench/README.md` states the command, the API key and Sign-in it needs, what a run costs, how to apply the sample Database, and how to read a report. It is checked by following it from a clean checkout.

## Appendix — the question set, for review

Answers are computed from the seed when it is built, and are not listed here.

| id | Question | type |
|---|---|---|
| B-01 | How many customers do we have? | integer |
| B-02 | How many products are currently active? | integer |
| B-03 | How many orders were placed in 2025? | integer |
| B-04 | How many orders have been cancelled, in total? | integer |
| B-05 | What was our total revenue from shipped orders in 2025? | number |
| B-06 | What is the average unit price of our active products? | number |
| B-07 | How many wholesale customers are there in the North region? | integer |
| B-08 | Which is our most expensive product? | text |
| B-09 | Which region had the most shipped orders in 2025? | text |
| B-10 | What was the revenue from shipped orders in 2025, by region? | map |
| B-11 | What are our three best-selling products by units sold in shipped orders? | list |
| B-12 | Which customer has placed the most orders? | text |
| B-13 | How many customers have never placed an order? | integer |
| B-14 | What was the average order value of shipped orders in the first quarter of 2026? | number |
| B-15 | Which month of 2025 had the highest revenue from shipped orders? Answer as YYYY-MM. | text |
| B-16 | What percentage of orders placed in 2025 were returned? | number |
| B-17 | What was the revenue from shipped orders in 2025, by product category? | map |
| B-18 | How many different products has the customer Harbour Foods bought? | integer |
| B-19 | Which regions beat their revenue target in the fourth quarter of 2025? | list |
| B-20 | By how much did the East region's shipped revenue exceed or miss its third-quarter 2025 target? Give a negative number for a miss. | number |
| B-21 | How many orders are there in each status? | map |
| B-22 | How much discount did we give away on shipped orders in 2025, in money? | number |
| B-23 | What is the average quantity per order line? | number |
| B-24 | On which day of the week are the most orders placed? | text |
| B-25 | How many orders were placed on 1 March 2026, Johannesburg time? | integer |
| B-26 | By what percentage did shipped revenue grow from the third to the fourth quarter of 2025? | number |
| B-27 | How many customers joined in 2026? | integer |
| B-28 | What was the 2025 revenue from shipped orders for retail customers and for wholesale customers? | map |
| B-29 | Which products have never been ordered? | list |
| B-30 | Which order had the highest value, by order id? | integer |
| B-31 | What was the median value of shipped orders placed in 2025? | number |
| B-32 | Which product category had the second-highest revenue from shipped orders in 2025? | text |
| B-33 | How many customers in the South region have more than 10 shipped orders? | integer |
| B-34 | On average, how many days after joining do customers place their first order? | number |
| B-35 | What percentage of 2025 shipped revenue came from our ten biggest customers that year? | number |
| B-36 | How many orders have more than three lines? | integer |
| B-37 | Which product has the highest share of its orders returned? | text |
| B-38 | What was the revenue from shipped orders in March 2026? | number |
| B-39 | What is the email address of the customer Harbour Foods? | unavailable |
| B-40 | What is the total salary of our staff? | unavailable |
