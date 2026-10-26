# S-004 — Measuring answer correctness on PostgreSQL

Delivers: anyone with a Staff member's sign-in and an Anthropic API key can run one command that puts the benchmark's 40 Questions to the deployed Server through Claude Sonnet 5.5, three times. The command writes a run report naming the deployed Server version and stating, for each run and on average, the share answered correctly and the share given up after three refused queries, the two figures the PRD's correctness metrics read.
Traces: R-012

## Screens
None (D-046). The run report is a file, read in an editor or on GitHub.

## Interface

```
npm run benchmark -- <deployment-url> [--runs N]   N defaults to 3
  needs:   ANTHROPIC_API_KEY (or an `ant auth login` profile); a browser for the first Sign-in
  writes:  bench/reports/<UTC date and time>-claude-sonnet-5-5.json and .md
  exit:    0 when every run completed, whatever the score; non-zero when it could not run
```

The harness is its own MCP client (D-091).

**Once per invocation,** it signs in as a Staff member through the Deployment's own Sign-in broker (ADR-004), as an AI tool does:
- it registers by stateless dynamic registration, with a plain-http loopback redirect URI on any port (D-072), and uses PKCE S256;
- the Staff member signs in to the Identity provider once, in a browser;
- the Refresh token is kept in `bench/.signin.json`, which is gitignored, so later invocations within its 30 days need no browser.

It then reads the tools from `tools/list`, and the Server's name and version from `initialize`. It offers the tools to the model as they are: names, descriptions and input schemas unchanged, so the model sees what Claude and ChatGPT see.

**For each run, and each Question in it,** it sends the Question to `claude-sonnet-5-5` through the Claude Messages API with `@anthropic-ai/sdk`, in a manual tool-use loop:
- `tool_choice` `auto`;
- adaptive thinking, at effort `high`;
- `max_tokens` 16,000;
- no refusal fallbacks (D-092);
- one fixed system prompt, below.

Each `tool_use` block goes to the Server as `tools/call`. The result comes back as a `tool_result`, with `is_error` set from the MCP result.

**A Question ends** at the first of these:
- the model stops calling tools;
- the third refused query of that Question: the count is cumulative, whatever succeeded in between (D-042, D-093);
- 20 model turns;
- a model refusal (`stop_reason` `refusal`);
- 400,000 input tokens spent on the Question.

**A refused query** is a `query` result whose text starts "The query was not accepted" (D-082). A Database error, a `list_tables` result, and a "The request was not accepted" input refusal do not count toward it.

The system prompt is fixed. It holds no Semantic model (D-034, D-037), states no business definition, and names nothing in the sample Database:

> You answer a Staff member's question about their organisation's data, using the tools you have. When you have the answer, end your reply with one line of the form `ANSWER: <value>`. For a number, give the number alone, with no units, no thousands separators and no percent sign, and with at least two decimal places unless it is a whole count. Do not round any intermediate value. For several values, separate them with commas. For values by group, write `name=value` pairs separated by commas. If the data needed is not available to you, write `ANSWER: UNAVAILABLE`.

The Question itself is sent as the user message, exactly as written in the question set. **Each Question states the definitions its answer depends on,** as a careful Staff member would: which orders count, revenue after discounts, and which time zone when it matters. The sample Database is built so that nothing else is left to interpretation (below).

### The Server's version
The run report must say which deployed Server it measured (D-093). The Worker gains Cloudflare's version-metadata binding (`version_metadata` in `wrangler.jsonc`), and `initialize` reports the Server's version as `<package version>+<Worker version id>`, for example `0.0.1+4dc70716-52c2-411c-8fc8-1b65af40d0ff`. That is the id each deploy record names. Off Workers, as in tests, it reports the package version alone.

## Data

### The sample Database
`bench/sample-db.sql` rebuilds schema `sqlmcp_test` as a small sales Database, deterministically: no `random()` and no clock, so every rebuild is identical and so is every expected answer. It replaces the S-002/S-003 fixture tables (D-092):

| table | columns | granted to `sqlmcp_reader` | rows |
|---|---|---|---|
| `regions` | `id`, `name` | all | 4: North, South, East, West |
| `customers` | `id`, `name`, `region_id`, `segment` (enum `retail`/`wholesale`), `joined_on` date, `email` | all but `email` | 60 |
| `products` | `id`, `name`, `category`, `unit_price` numeric(10,2), `active` bool | all | 25 |
| `orders` | `id`, `customer_id`, `placed_at` timestamptz, `status` (enum `pending`/`shipped`/`cancelled`/`returned`) | all | about 1,200, from 2025-01-01 to 2026-03-31 |
| `order_lines` | `order_id`, `product_id`, `quantity` int, `unit_price` numeric(10,2), `discount_rate` numeric(3,2) between 0.00 and 0.30 | all | about 3,000 |
| `targets` | `region_id`, `year`, `quarter`, `revenue_target` numeric(12,2) | all | 20 |
| `staff` | `id`, `name`, `salary` numeric(10,2) | none | 5 |

The seed holds to these rules, each tested:
- **Ownership and grants.** Everything is owned by `postgres`, and `USAGE` on the schema is granted to `sqlmcp_reader`.
- **Ids.** Order ids start at 10001, so no earlier fixture's id range overlaps them.
- **Names** contain no comma and no `=`, so `list` and `map` answers parse.
- **The discount is a fraction.** Its column is named `discount_rate`, and every value is between 0.00 and 0.30.
- **Timestamps:**
  - every `placed_at` is at 12:00 UTC, so UTC and Africa/Johannesburg (UTC+2) agree on its date, month, quarter and year;
  - the only exception is a batch of cancelled orders at 22:30 UTC on 2026-02-28, which is 1 March in Johannesburg, for B-25.
- **No ties.** For every `text`, `list` and top-N Question, the expected answer leads the runner-up by at least 1%, or by one whole unit for counts.
- **Odd counts.** The number of shipped orders placed in 2025 is odd, so its median is a single order's value.

### The question set
`bench/questions.json` holds 40 Questions. Each has:
- an `id` (`B-01` to `B-40`) and the Question's text;
- an answer type: `integer`, `number`, `text`, `list`, `map` or `unavailable`;
- the expected answer;
- the reference SQL that computes it;
- for the `text`, `list` and top-N Questions, a tie-check SQL that returns the answer and the runner-up with their values.

For the two `unavailable` Questions, the reference SQL reads the data as `postgres`, and the test checks that it is refused as `sqlmcp_reader`.

The expected answers are written into the file once, from the reference SQL, and reviewed at code review against each Question's stated definitions. Three cross-checks make them more than self-consistent:
- B-10's regions and B-17's categories each sum to B-05, and B-28's two segments sum to B-05;
- B-21's statuses sum to the order count;
- B-03 plus the 2026 orders equals the same count.

The set is listed in the appendix for review at this spec's gate.

### Judging
The Judge reads the last `ANSWER:` line of the model's final reply and compares it with the expected answer:
- **`integer`:** exact.
- **`number`:** the answer matches when it is within 0.5% of the expected value, or within 0.01 of it, whichever is wider.
- **`text`:** equal ignoring case, surrounding spaces and a trailing full stop.
- **`list`:** the same set, compared as `text` item by item, in any order.
- **`map`:** the same keys, compared as `text`, each value compared as `number`.
- **`unavailable`:** the literal `UNAVAILABLE`.

A reply with no `ANSWER:` line is incorrect. A Question ends in one of four ways:
- **correct;**
- **incorrect;**
- **given up:** the third refused query;
- **error:** a model refusal, the turn or token cap, or an API failure.

The two `unavailable` Questions can end given up like any other.

### The run report
The JSON form holds one row per Question per run:
- its outcome, the `ANSWER:` value given and the expected value;
- the counts of `query` and `list_tables` calls, and of refused queries;
- each Refusal's `reason_class` and sentence, as the Server returned them, so Q-032's and Q-034's costs show;
- the model's input, output and cache-read tokens;
- its duration.

It holds the totals, correctness share and give-up share for each run, and their mean, minimum and maximum across runs. It also holds what a rerun needs:
- the Deployment URL, and the Server name and version from `initialize`, which includes the Worker version id;
- the model id, effort and system prompt;
- the harness's git commit;
- the question set's SHA-256;
- the number of runs;
- the date and time of the run;
- its total token use and approximate cost.

The `.md` form is the same, as a table and a summary. Neither holds a Sign-in, a Refresh token or an API key, and neither holds any Audit record field.

## Proven by
- **The seed:**
  - running `bench/sample-db.sql` twice against Docker PostgreSQL 17 gives byte-identical table contents;
  - every `placed_at` is at 12:00 UTC except the B-25 batch;
  - every `discount_rate` is between 0.00 and 0.30;
  - no name contains `,` or `=`;
  - every order id is at least 10001.
- **Expected answers:**
  - every Question's reference SQL, run as `postgres` on that Database, returns the expected answer stored for it, under the Judge's own rules;
  - the two `unavailable` Questions' data is refused as `sqlmcp_reader`;
  - every tie check shows the expected answer leading the runner-up by at least 1%, or one unit;
  - the cross-checks hold: B-10, B-17 and B-28 each sum to B-05; B-21 sums to the order count; B-03 plus the 2026 count equals it.
- **The question set:** it holds exactly 40 Questions, `B-01` to `B-40`, each with a text, an answer type, an expected answer and reference SQL.
- **The Judge**, with the expected value named first in each case:
  - expected 1234.56: it accepts `ANSWER: 1234.56` and `ANSWER: 1238.00`, and rejects `ANSWER: 1241`;
  - expected 0.5: it accepts `ANSWER: 0.51`;
  - expected 7.46: it accepts `ANSWER: 7.46`;
  - expected `North`: it accepts `ANSWER: north`;
  - expected the list `a, b`: it accepts `ANSWER: b, a`;
  - expected the map `{North: 10, South: 20}`: it accepts `ANSWER: North=10, South=20.05`;
  - only the last `ANSWER:` line counts, and a reply with none is incorrect.
- **Against a fake model and a fake Server:**
  - the harness offers exactly the tools `tools/list` returned;
  - it forwards each `tool_use` with its input unchanged, and returns each result with `is_error` as the Server set it;
  - it ends a Question as given up on the third result starting "The query was not accepted", counted across successful queries in between, and makes no further model call for it. A Database error and an input refusal do not count;
  - it ends a Question as an error after 20 model turns, after 400,000 input tokens, and on a `refusal` stop reason.
- **The run report:**
  - its totals equal its rows, for each run and across the three;
  - correctness is correct ÷ 40 and give-up is given up ÷ 40, per run, with their mean, minimum and maximum;
  - it names the model id, effort, Deployment URL, Server version, harness commit, question-set hash and run count;
  - it lists each Refusal's class and sentence;
  - two invocations in the same day write two reports;
  - it holds no string from the Sign-in cache or `ANTHROPIC_API_KEY`.
- **Sign-in:**
  - against the app with a fake Identity provider, the harness registers a loopback redirect URI, signs in with PKCE S256 once per invocation, and calls `tools/list` with the resulting Sign-in;
  - a second invocation uses the cached Refresh token, with no browser step;
  - `bench/.signin.json` is listed in `.gitignore`.
- **The Server's version:** on Workers, `initialize` reports `<package version>+<Worker version id>`. In tests, with no binding, it reports the package version.
- **Live, on the project test Deployment** with the sample Database applied:
  - one invocation with `claude-sonnet-5-5` completes three runs of all 40 Questions;
  - its report, naming the deployed version id, is committed under `bench/reports/`;
  - its mean, minimum and maximum correctness and give-up shares, and its cost, are recorded in this spec.

  A mean correctness below 90% (D-045), or a mean give-up share above 5% (PRD), is raised as a Q-### naming the Questions that failed. It does not fail the slice, which delivers the measurement.

## Out of scope
- **MS SQL Server's benchmark run:** S-008.
- **Other AI tools and models:** one model per release (D-037). Rerunning with another model id is possible from the command line, but this iteration's report names `claude-sonnet-5-5`.
- **Running the benchmark in CI on every change:** each run spends API credit and needs a Staff member's Sign-in.
- **The Release test harness's other runs** (components.md): the visibility run is S-008's, and the tier matrix is S-010's and S-011's.
- **Semantic models** (D-034).

## Needs before live verification
An Anthropic API key for whoever runs it. The sample Database applied to `sqlmcp_test` in the AI Golf App Supabase project, with its grants. The Staff member's Entra account.

**Cost.** An invocation of three runs puts 120 Questions to the model. Most take a few turns of a few thousand tokens. At Claude Sonnet 5.5's $2 / $10 per million tokens, that is expected to be a few US dollars, capped at 400,000 input tokens per Question. The first report records the real figure.

**Earlier records.** The sample Database replaces the S-002/S-003 fixtures (D-092). S-003's deploy record's rollback `DELETE … BETWEEN 105 AND 604` then touches nothing, because the sample's order ids start at 10001. S-002's and S-003's "Try it" counts no longer apply, and T-007 notes this in both deploy records.

## Tasks

### T-001 — The sample Database rebuilds identically, to the rules that keep its answers unambiguous
Verified by: benchmark_seed_is_deterministic, benchmark_seed_follows_its_rules

### T-002 — Every expected answer is the reference SQL's, unique, and consistent with the others
Verified by: reference_sql_yields_expected_answers, expected_answers_have_no_ties, expected_answers_are_consistent, unavailable_questions_are_refused_as_the_reader

### T-003 — The question set is well formed
Verified by: question_set_is_well_formed

### T-004 — The Judge decides each answer by its type
Verified by: judge_numbers_within_tolerance, judge_text_lists_and_maps, judge_reads_last_answer_line, judge_missing_answer_line_is_incorrect

### T-005 — The harness puts each Question to the model with the Server's own tools, and ends it as D-042 and the caps say
Verified by: harness_offers_tools_from_tools_list, harness_forwards_calls_and_results, harness_gives_up_after_three_refused_queries, harness_caps_turns_tokens_and_records_refusals

### T-006 — The run report states each run's figures and their spread, what a rerun needs, and no secret
Verified by: report_totals_spread_and_metadata, report_lists_refusals_by_class, report_paths_do_not_collide, report_holds_no_tokens_or_keys

### T-007 — The harness signs in once per invocation through the Server's broker, and reuses its Refresh token
Verified by: harness_signs_in_with_loopback_and_pkce, harness_reuses_cached_refresh_token, signin_cache_is_gitignored

### T-008 — The Server reports its deployed version
Verified by: server_version_names_worker_version

### T-009 — The sample Database is applied to the project test Database
Verified by: manual. In the AI Golf App Supabase project, `bench/sample-db.sql` is run as `postgres`. `sqlmcp_test` then holds the tables and row counts above. `list_tables` as `sqlmcp_reader` lists every table but `staff`, and every `customers` column but `email`. S-002's and S-003's deploy records each gain a line saying their Try it counts no longer apply.

### T-010 — The first live run is made and its figures recorded
Verified by: manual. `npm run benchmark -- https://sql-mcp-server.prinsloopower.workers.dev` completes three runs of all 40 Questions. Its report is committed under `bench/reports/`, and its figures and cost are recorded in this spec, with a Q-### for any target missed.

### T-011 — Anyone can rerun the benchmark from the docs alone
Verified by: manual. `bench/README.md` states the command, the API key and Sign-in it needs, what a run costs, how to apply the sample Database, and how to read a report. It is checked by following it from a clean checkout.

## Appendix — the question set, for review

Answers are computed from the seed when it is built, and are not listed here. "Revenue" in a Question is always defined in that Question.

| id | Question | type |
|---|---|---|
| B-01 | How many customers do we have? | integer |
| B-02 | How many products are currently active? | integer |
| B-03 | How many orders were placed in 2025, whatever their status? | integer |
| B-04 | How many orders have been cancelled, in total? | integer |
| B-05 | What was our total revenue in 2025, counting only shipped orders and taking each line's discount off? | number |
| B-06 | What is the average unit price, from the product list, of our active products? | number |
| B-07 | How many wholesale customers are there in the North region? | integer |
| B-08 | Which product has the highest unit price on our product list? | text |
| B-09 | Which region had the most shipped orders placed in 2025? | text |
| B-10 | What was the revenue from shipped orders placed in 2025, after discounts, for each region? | map |
| B-11 | What are our three best-selling products, by total quantity sold in shipped orders? | list |
| B-12 | Which customer has placed the most orders, counting orders of any status? | text |
| B-13 | How many customers have never placed an order of any status? | integer |
| B-14 | What was the average value of shipped orders placed in the first quarter of 2026, where an order's value is the sum of its lines after discounts? | number |
| B-15 | Which month of 2025 had the highest revenue from shipped orders, after discounts? Answer as YYYY-MM. | text |
| B-16 | What percentage of the orders placed in 2025 were returned? | number |
| B-17 | What was the revenue from shipped orders placed in 2025, after discounts, for each product category? | map |
| B-18 | How many different products appear in orders placed by the customer Harbour Foods, of any status? | integer |
| B-19 | Which regions' revenue from shipped orders, after discounts, beat their revenue target in the fourth quarter of 2025? | list |
| B-20 | By how much did the East region's revenue from shipped orders, after discounts, exceed its revenue target in the third quarter of 2025? Give a negative number if it fell short. | number |
| B-21 | How many orders are there in each status? | map |
| B-22 | In 2025, how much money did discounts take off our shipped orders? | number |
| B-23 | What is the average quantity per order line, across all orders? | number |
| B-24 | On which day of the week were the most shipped orders placed? | text |
| B-25 | How many orders were placed on 1 March 2026, in Johannesburg time? | integer |
| B-26 | By what percentage did revenue from shipped orders, after discounts, grow from the third quarter to the fourth quarter of 2025? | number |
| B-27 | How many customers joined in 2026? | integer |
| B-28 | What was the 2025 revenue from shipped orders, after discounts, for retail customers and for wholesale customers? | map |
| B-29 | Which products have never been ordered, in an order of any status? | list |
| B-30 | Which shipped order has the highest value, after discounts? Give its order id. | integer |
| B-31 | What was the median value, after discounts, of shipped orders placed in 2025? | number |
| B-32 | Which product category had the second-highest revenue from shipped orders placed in 2025, after discounts? | text |
| B-33 | How many customers in the South region have more than 10 shipped orders? | integer |
| B-34 | On average, how many whole days after joining do customers place their first order of any status? | number |
| B-35 | What percentage of 2025's revenue from shipped orders, after discounts, came from the ten customers with the most such revenue? | number |
| B-36 | How many orders have more than three lines? | integer |
| B-37 | Which product has the highest share of the orders containing it, of any status, that were returned? | text |
| B-38 | What was the revenue from shipped orders placed in March 2026, after discounts? | number |
| B-39 | What is the email address of the customer Harbour Foods? | unavailable |
| B-40 | What is the total salary of our staff? | unavailable |

## Critique findings

Gate 1, 2026-10-25, critique in fresh context. Verdict: fail (1 blocker, 6 gaps, 8 nits). Checked against `src/tools/query.ts` (Refusal sentences), `src/mcp.ts` (`SERVER_INFO`), the MCP SDK's `client/auth.js` (PKCE S256, dynamic registration and refresh are all there), and the Claude API reference for `claude-sonnet-5-5` (effort default `high`, non-default `temperature` rejected, 512-token cache minimum).

- **blocker — the Questions do not state the revenue definition the expected answers depend on.** Data says "Revenue is `quantity × unit_price × (1 − discount)` over a shipped order's lines. The Questions say so where a Staff member would", but none of the 40 does. B-05, B-10, B-14, B-15, B-17, B-19, B-20, B-26, B-28, B-30, B-31, B-32, B-35 and B-38 all rest on it. A reasonable Agent can also sum `quantity × unit_price` gross, or price lines from `products.unit_price`. Nothing says whether `discount numeric(4,2)` holds a fraction (0.10) or a percentage (10.00), and the type allows either. With any real discount, gross and net differ by far more than the 0.5% tolerance. The same goes for time zone. `placed_at` is `timestamptz`, and only B-25 names a zone. Nothing keeps the seed's timestamps away from year, quarter, month and day boundaries, so "placed in 2025", "March 2026" and B-24's weekday depend on whether the Agent reads UTC or Johannesburg time. Build will send the appendix's text verbatim, as Interface step 3 says, and compute answers in the Docker session's UTC. The live run (T-008) will then score up to a third of the set on how the Agent guesses a definition, not on the Server. D-037 excludes exactly that by leaving out the Semantic model. Fix: state the revenue rule and the discount scale in the Questions, or make the schema unambiguous. Also require the seed to place every timestamp where UTC and Africa/Johannesburg agree on the date, except for deliberate cases around 1 March 2026 for B-25.
- **gap — nothing makes each expected answer the only right one, and the check on them is circular.** Appendix: "Answers are computed from the seed when it is built". `reference_sql_yields_expected_answers` therefore compares the reference SQL with its own output, and only catches seed drift. Neither the seed nor any Proven by line rules out ties. Ties can arise for B-08, B-09, B-11 (third place), B-12, B-15, B-24, B-30, B-32 and B-37, or for B-35's tenth customer. Several Questions also allow more than one defensible reading:
  - B-12 and B-18: whether cancelled, pending and returned orders count as "placed" or "bought";
  - B-30: "highest value, by order id", across all statuses or only shipped;
  - B-31: `percentile_cont` or `percentile_disc`;
  - B-34: whole days or fractional days, and the date in which time zone;
  - B-37: the share by orders or by units, and which statuses form the denominator.

  Build can produce a seed with a tie and a `LIMIT 1` reference SQL, and every test still passes. Verify would then score a correct answer as incorrect. Add a Proven by line: each `text` or `list` answer leads the runner-up by a stated margin. Tighten the wording of the Questions named above.
- **gap — the system prompt sets no precision, so rounding can fail a correct answer.** The prompt says only "give the number alone". The `number` rule allows 0.5%, or 0.01 when the expected value is under 2. A percentage such as B-16, B-26 or B-35 that comes out near 7.46 and is reported to one decimal, 7.5, is 0.54% off and judged incorrect. Values under 2 fail at one decimal place. The live run will mark such answers wrong because of the harness, not the Server. Ask for a stated precision in the prompt (for example, at least two decimal places and no rounding of intermediate values), or let the Judge accept any value that rounds to the precision given. Add a Judge test for each.
- **gap — the give-up rule is worded two ways, and "refused" is not defined here.** Interface step 4 ends a Question "when the model's third Agent-written query is refused", which can be read as the third query being refused. Proven by says "on the third refused `query` call", a count of refusals. The spec also leaves open:
  - whether refusals count cumulatively when successful queries come between them;
  - what counts as refused. D-092 says a result whose text starts "The query was not accepted", but the spec does not cite it, so build may count every `is_error` result. That would include Database errors such as timeouts and "The request was not accepted".
  - whether B-39 and B-40 can end as given up. Two Questions are exactly the 5% threshold.

  `harness_gives_up_after_three_refused_queries` can be written to any of these readings, and the give-up figure changes with the choice. State D-092's prefix rule and that the count is cumulative per Question, and add a fake-Server case with a Database error that does not count.
- **gap — the run report cannot identify which Server release it measured.** It records "the Server name and version from `initialize`", which is the fixed `SERVER_INFO` `{ name: "sql-mcp-server", version: "0.0.1" }` in `src/mcp.ts`, plus the harness's own commit. Neither changes when the Worker is redeployed. The slice exists so the project can state figures "for each release". Two reports from different deployed versions will look identical, so `report_totals_and_metadata` passes on a value that identifies nothing. Record the deployed Worker version id, or the Server's commit, or have the Server's `initialize` version carry it.
- **gap — one run per release, with no allowance for the model's own variance.** Sonnet 5.5 rejects non-default `temperature`, and adaptive thinking varies from run to run, so the same release can score differently. One Question is 2.5 points. "Rerunnable" here means the same inputs, not the same result. Without a repeat count or a stated spread, a later release's report cannot tell a Server regression from noise, and a single run near 90% decides whether a Q-### is raised. Either run the set several times and report the mean and range, or state the measured run-to-run spread in the first report and say how the figures are compared.
- **nit — the caching claim and the cost are not borne out.** The system prompt plus two tool definitions is near Sonnet 5.5's 512-token cache minimum, and the growing conversation, with result rows of up to 500, is not cached at all. "Needs before live verification" gives no estimate or ceiling for the API credit the owner has to fund. Add an approximate figure and a per-run token cap.
- **nit — step 1 reads as signing in once per Question.** It sits under "For each Question it does the following". Sign-in happens once per run.
- **nit — the two `unavailable` Questions cannot meet "every Question's reference SQL … returns the expected answer".** Their expected answer is `UNAVAILABLE`. Say what their reference SQL proves, for example that it fails as `sqlmcp_reader`.
- **nit — S-003's deployment record turns harmful once the seed replaces the fixtures.** Its Rollback suggests `DELETE FROM sqlmcp_test.orders WHERE id BETWEEN 105 AND 604`, which would now silently delete benchmark orders and change every expected answer. Its and S-002's Try it counts are also stale (D-092). Note it in T-007, or start the sample's order ids outside that range.
- **nit — same-day runs overwrite each other.** The report path is `<UTC date>-claude-sonnet-5-5`; a time or a run number avoids that.
- **nit — the report does not record which Refusal sentences fired.** Q-032 and Q-034 both say "S-004's benchmark will show" what refusing constructs costs. A per-row count of refusals alone cannot show it.
- **nit — the Judge's first example is hard to read, and list and map delimiters can collide with names.** "`ANSWER: 1234.56` matches 1,234.56 and 1,238" does not say which value is the expected one. Product or category names containing `,` or `=` would break `list` and `map` parsing. The seed should avoid both characters.
- **nit — "later slices" for the other Release test harness runs could name them.** They are S-008 (visibility) and S-010 and S-011 (the tier matrix).

Revision 2, 2026-10-25:

- **Definitions** (blocker) → every revenue Question states its own rule: shipped orders, after each line's discount. The discount column is `discount_rate`, a fraction between 0.00 and 0.30. Every `placed_at` is at 12:00 UTC, so UTC and Johannesburg agree on every date, except a cancelled batch for B-25. The system prompt still states no definition, so the Server is what is measured (D-037).
- **Unique, checked answers** → the seed keeps every top answer at least 1% or one unit ahead of the runner-up, tested by `expected_answers_have_no_ties`. Totals are cross-checked across Questions (`expected_answers_are_consistent`), and expected answers are reviewed at code review. The ambiguous Questions are reworded:
  - B-12, B-13, B-18 and B-29 say "of any status";
  - B-30 says "shipped, after discounts";
  - B-31's count is odd, so its median is one order;
  - B-34 says "whole days";
  - B-37 says "share of the orders containing it, of any status".
- **Precision** → the system prompt asks for at least two decimal places and no rounding of intermediate values. The Judge accepts within 0.5% or 0.01, whichever is wider, with tests at 7.46 and 0.5.
- **Give-up** → the count is cumulative per Question, and only results starting "The query was not accepted" count (D-082). Database errors and input refusals do not. B-39 and B-40 can end given up. A fake-Server test covers the uncounted cases.
- **Server release** → `initialize` reports `<package version>+<Worker version id>` from Cloudflare's version-metadata binding (T-008), so each report names the deployed version.
- **Variance** → three runs per invocation by default, with each run's figures and their mean, minimum and maximum (D-093). The targets are judged on the mean.
- **Nits:**
  - sign-in is once per invocation;
  - a token cap of 400,000 input tokens per Question, and a cost estimate;
  - the `unavailable` Questions are checked as refused for the reader;
  - order ids start at 10001, and the earlier deploy records gain a note (T-009);
  - report names carry the time;
  - Refusals are listed by class and sentence;
  - the Judge examples name the expected value first;
  - names avoid `,` and `=`;
  - the other harness runs name S-008, S-010 and S-011.
