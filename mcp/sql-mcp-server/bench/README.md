# The answer-correctness benchmark

This measures how often an AI tool answers a Staff member's question correctly from a deployed SQL MCP Server (R-012, S-004). It puts 40 Questions about a sample sales Database to Claude Sonnet 5.5, which uses the Server's own `list_tables` and `query` tools, the same ones Claude and ChatGPT see. A Judge then compares each answer with the expected one.

A run reports two figures:
- **correctness:** the share of the 40 answered correctly;
- **give-up:** the share abandoned after three refused queries.

## Before you run it

You need four things:

1. **Node.js 24 or later,** as `package.json` requires, and `npm install` run in this folder's parent, the repository root.
2. **An Anthropic API key,** in the `ANTHROPIC_API_KEY` environment variable of the shell you run from. Set it in that shell only, never in a file in this repository:
   - PowerShell: `$env:ANTHROPIC_API_KEY = "<your key>"`
   - bash: `export ANTHROPIC_API_KEY=<your key>`
3. **A Staff member's sign-in** for the Deployment, such as your Entra ID account for the project test Deployment.
4. **The sample Database** applied to the Deployment's Database, as described below.

## Run it

From the repository root:

```
npm run benchmark -- https://sql-mcp-server.prinsloopower.workers.dev
```

To make several runs in one go, add `--runs N`. One run is the default.

**Signing in.** The first time, your browser opens at the Server's sign-in. Sign in as the Staff member, and the browser then says you can close it. The harness keeps the resulting Refresh token in `bench/.signin.json`, which git ignores. Later runs within 30 days need no browser. Delete that file to sign in again, or to switch Deployments.

**What you see.** While it runs, the harness prints progress, one line per answered Question. At the end it prints each run's correctness and give-up, the approximate cost, and the report's path.

The command exits:
- **0** when every run completed, whatever the score;
- **1** when it could not run, for example when the sign-in failed or the API key is missing;
- **2** when its arguments are wrong.

## What it costs

A run usually costs about **US$5–15** of Anthropic API credit. Each Question takes several model turns, and each turn resends the conversation so far, including the rows the Server returned. The report states the actual token use and cost.

Caps bound the worst case:

| Limit | What happens |
|---|---|
| 20 model turns for one Question | The Question ends as an error. |
| 400,000 input tokens for one Question | The Question ends as an error. |
| 8,000,000 input tokens per run asked for | The invocation stops, at most about US$16 of input per run, and the report marks the Questions it did not reach. |

## The sample Database

`sample-db.sql` rebuilds schema `sqlmcp_test` as a small sales Database:
- 4 regions, 60 customers, 25 products and 20 quarterly targets;
- about 1,200 orders and 3,000 order lines, from January 2025 to March 2026;
- a `staff` table that the benchmark account may not read.

It grants read access to the role `sqlmcp_reader`, the Deployment's Database account, on everything except `staff` and `customers.email`. It does not create that role.

**To apply it,** run the whole file as `postgres` against the Deployment's Database, for example in the Supabase SQL editor or with `psql -f bench/sample-db.sql`.
- It drops and rebuilds `sqlmcp_test`, so anything else in that schema is lost.
- The file is generated, so don't edit it by hand.

**To change the data or the Questions:**
1. Edit `src/sample.ts` or `src/question-set.ts`.
2. Start the test Database with `npm run db:up`.
3. Run `npx tsx bench/build-sample.ts`.

The build script tries seeds until no answer has a close runner-up. It then rewrites `sample-db.sql` and `questions.json`, each expected answer taken from its Question's reference SQL. `npm test` checks the rules the data must keep.

## Reading a report

Each invocation writes two files, `reports/<UTC date and time>-claude-sonnet-5-5.json` and `.md`, and never overwrites an earlier one. Commit the report a release is judged by.

The `.md` file, which reads well on GitHub, has these parts:
- **A header:** what a rerun needs, namely the Deployment, the Server version (its `+` suffix is the deployed Worker version id), the model and effort, the harness commit, the question set's SHA-256, the number of runs, the tokens and the cost.
- **Summary:** each run's counts, its correctness and give-up and, for several runs, their mean, minimum and maximum. The PRD's targets are at least 90% correct (D-045) and at most 5% given up.
- **Refusals:** each sentence the Server refused a query with, and how often. A sentence names the rule a query broke, so this shows which rules cost the most.
- **One table per run,** with one row per Question:
  - its outcome;
  - the `ANSWER:` value given, and the expected value;
  - the count of tool calls;
  - the tokens;
  - the time taken.

Each Question ends in one of these outcomes:

| Outcome | Meaning |
|---|---|
| correct | The answer matches the expected one. |
| incorrect | The answer is wrong, or the reply has no `ANSWER:` line. |
| given up | The Question met its third refused query. |
| error | A model refusal, a cap, or an API or Server failure. The reason follows the outcome. |
| not reached | The invocation's token ceiling stopped it first. |

The `.json` file holds the same content, for comparing releases. Neither file holds a Sign-in, a Refresh token or an API key.

## How answers are judged

The Judge reads the last `ANSWER:` line of the model's final reply, ignoring Markdown such as backticks and bold, and compares it by type:

| Type | Rule |
|---|---|
| Whole numbers | Must match exactly. `10234`, `10234.00` and `10,234` are the same answer. |
| Other numbers | Within 0.5% or 0.01 of the expected value, whichever is wider. |
| Text | Compared ignoring case, spaces and a trailing full stop. |
| Lists | Compared as sets. |
| Maps (`name=value` pairs) | Need every key, with each value judged as above. |

The two Questions whose data the Server withholds expect `UNAVAILABLE`. The rules are in `src/judge.ts` and the S-004 spec.
