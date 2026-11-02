# S-005 — Deploying on Cloudflare from the docs alone

Delivers: an Operator who has never deployed the Server follows the README and the Deployment kit's guide, runs one setup command, and has a public, read-only Deployment on Cloudflare against their own Supabase PostgreSQL. It is deployed, connected and reachable within the hour R-013 sets, then its Sign-in is set up and Staff members are answering questions through it. The run is timed and recorded in the deployment trial log. MS SQL Server organisations still have no Deployment.
Traces: J-001, R-001, R-013

The hour is R-013's: it ends when the Deployment is deployed, connected to the Database and reachable, with Sign-in still refusing every call (J-001's resolution). Registering with the Identity provider and the Database administrator's grants fall outside it. The trial times the rest, through the first answered question, without a target (D-099, Q-038).

## Screens
None (D-046). The Operator sees a terminal and the Cloudflare, Supabase and Entra dashboards. Staff members see their AI tool.

## The Deployment kit
Everything the Operator uses. All of it lives in the repository, under `deploy/cloudflare/` unless named otherwise.

| piece | what it holds |
|---|---|
| `README.md`, at the package root | what the Server does, the two pairings this release supports (D-063) and that AWS is planned, the AI tools it supports (Claude and ChatGPT) and that others are planned (D-043), what a Deployment needs, Workers Logs' fixed retention for Audit records (operations.md), and a link to the guide. J-001 step 1 is answered here, before the Operator invests any time |
| `deploy/cloudflare/guide.md` | the Operator guide, below |
| `deploy/cloudflare/database-account.sql` | the SQL that creates the Database account on Supabase. The setup command fills it in and prints it, below |
| `deploy/cloudflare/wrangler.template.jsonc` | the config fields every Deployment shares, below |
| `deploy/cloudflare/staff.md` | for Staff members: adding the Deployment to Claude and to ChatGPT, signing in, and what a Refusal means |
| `npm run setup` | the setup command, below |
| `npm run smoke` | unchanged. The guide also gives its checks as `curl` commands (operations.md) |

### The guide
In the order the Operator meets it:
1. **Before you start:**
   - what to have to hand: a Cloudflare account, a Supabase project, Node 24 and git, and for Sign-in, rights to register an application in Entra ID;
   - the plan. Workers Free runs the Server and is enough to try it. Paid is recommended for real use, because Free limits CPU time per request and requests per day (D-101);
   - Audit record retention. Workers Logs keeps them 3 days on Free and 7 on Paid, and nothing longer is possible on Cloudflare (operations.md). An Operator whose policy needs longer stops here. The README says the same, so the Operator can check it before cloning anything (J-001 step 1).
2. **The Database account:** why it must be dedicated, why Supabase's `postgres` role is refused (D-077), and that its grants are the Allow-list (D-074). The setup command makes the account's password and prints the SQL to run in Supabase's SQL editor. The guide says what that SQL does and what its listing means (D-105). Granting tables is left to the Database administrator and to section 6.
3. **Setup:** `npm run setup`, what it asks, and what each answer becomes. Also each Wrangler command and Cloudflare API call it makes, in order, so an Operator can see what it did and finish or undo a step by hand. It says to keep a backup of `wrangler.<worker name>.jsonc`, which holds no secret, and what to do if it is lost (section 9).
4. **Checking it:** the smoke checks and what each failure means.
5. **Sign-in:** registering the Server in Entra ID, with the redirect URI the setup command printed, then `npm run setup -- signin`. Also that anyone the Identity provider authenticates gets in (D-015, J-002 step 2).
6. **Making data visible:** granting SELECT to the Database account, by table and by column, with the sample grants from S-002's deploy record as a pattern. Grants take effect without a redeploy.
7. **Connecting Staff members:** pointing them at `staff.md`.
8. **Running it:**
   - changing a Server setting, which means editing the config and running `npm run setup -- deploy`;
   - rollback with `wrangler rollback` (operations.md). No commit so far has changed the token format's `v` (data-model.md), so a rollback to any earlier deploy keeps Sign-ins. The guide says that a commit which changes `v` will say so in its message, until releases carry notes (D-104);
   - rotating `SERVER_SECRET` (security.md), `IDP_CLIENT_SECRET` (a new client secret in Entra ID, then `npm run setup -- signin`), and the Database account's password (`npm run setup -- password`). A redeploy alone does not change the password Hyperdrive holds;
   - moving to a newer Server: `git pull`, then `npm run setup -- deploy` (D-104);
   - finding Audit records with the filter visibility.md gives, and the daily-volume caution (operations.md);
   - **monitoring,** one entry for each signal in operations.md's monitoring table. Each entry gives where to watch it on Cloudflare and when a human is called:
     - `/healthz`, through an external monitor;
     - Database errors, Identity provider failures, Server faults and configuration errors, each as a Workers Logs query on the Server's own lines (`$metadata.type` `cf-worker`, and the field that names the signal);
     - 5xx responses, from the Worker's request metrics.

     Where Cloudflare offers a notification for the signal, the guide names it. Where it does not, it says the Operator must check the query or use their own tooling. Nothing is set up automatically;
   - removing a Deployment completely.
9. **Troubleshooting:**
   - each `/healthz` and smoke failure (`config: invalid`, `database: unreachable`, `database: unsafe`), and what to change for each;
   - a setup run that stopped partway, and how rerunning it resumes;
   - a lost `wrangler.<worker name>.jsonc`, and how setup adopts the Worker again;
   - a new Cloudflare account with no `workers.dev` subdomain yet;
   - a redirect URI mismatch at Sign-in;
   - TLS-intercepting software (operations.md).

The guide names each Server setting by its domain name and its variable, and refers to environments.md for meanings, not restating them.

### `database-account.sql`
A template with two slots, the role's name and its password's SCRAM-SHA-256 verifier. The setup command fills both and prints the result for the Operator to run as `postgres` in the Supabase SQL editor. The password itself never reaches Supabase, its SQL editor's saved snippets or PostgreSQL's statement log (D-106). The SQL creates the role with `LOGIN` and no other attribute: no `BYPASSRLS`, no membership of `pg_read_all_data` or any other role, and no grant. A Deployment using it therefore passes the D-077 check.

If a role of that name already exists, the SQL changes nothing, rather than taking over an account another Deployment may use. The one exception is a role setup made for this same Deployment, which the SQL marks with a comment naming it. For that role, the same SQL sets the new password, which is how a rerun and the `password` form use it (D-109).

**What the role can already read.** Its last statement lists every table, view and column the new role can read outside the system schemas, as the Allow-list would see it (D-074), with no Boundary. That includes anything granted to `PUBLIC`. S-002's deploy record asks the kit to settle this, because Supabase grants `PUBLIC` in its own schemas.
- **On the AI Golf App project, checked on 2026-10-31:** a login role with no grants reads no table or view outside the schemas granted to it, so the list is empty.
- **If the list is not empty,** another Supabase version, or an extension, has granted something to `PUBLIC`. The guide tells the Operator to set a Boundary naming their own schemas, which `npm run setup` asks for, and says why (D-105).

### The setup command
`npm run setup` runs `deploy/cloudflare/setup.ts` with tsx. It is interactive. It checks every answer as it is given, before it calls Cloudflare. It asks, in this order:

| question | default | becomes |
|---|---|---|
| Worker name | none | the config's `name`, the `workers.dev` hostname, and the Hyperdrive config's name |
| whether this is a lost Deployment to adopt, asked only when no file for that Worker name is on disk | none: Enter for a new Deployment | the Worker's name typed again starts adoption, and no other question is asked (step 2, D-110) |
| Supabase session pooler host and port | none, and `5432` for the port, the session pooler's | the Hyperdrive config's origin |
| database name | `postgres` | as above |
| Database account | `sqlmcp_reader` | as above. Supabase's pooler wants `<role>.<project ref>`, so the command asks for the project ref and builds the name. The role `postgres` is refused here, as is any `postgres.<ref>` (D-077) |
| (not asked) its password | generated: 32 random bytes, base64url | the Hyperdrive config, and the verifier in the printed SQL. It is never shown |
| schemas in the Boundary | none, meaning no Boundary (D-075) | `BOUNDARY` as `{"schemas":[…]}`. The question says to name them if `database-account.sql` listed anything (D-105). Table exclusions are added by editing the config (guide section 8) |
| Row limit | `500` | `ROW_LIMIT` |
| Cloudflare account, asked last and only when Wrangler's Cloudflare login reaches more than one | none; chosen from a list | the config's `account_id`, and the account every call and API request uses |

It then works through these steps, stopping at the first failure with what failed and what to do:
1. **Checks the Cloudflare sign-in** (`wrangler whoami`), and asks the Operator to run `npx wrangler login` if Wrangler is not signed in. It lists the accounts the sign-in reaches, and asks which to use if there is more than one. It also checks that the account has a `workers.dev` subdomain, and if not, says where in the dashboard to choose one.
2. **Refuses to take over a Worker it did not make.** If a Worker of that name exists in the account and no `wrangler.<worker name>.jsonc` is on disk, it stops: redeploying over a Worker setup did not create would replace another Deployment. A Worker setup made, whose file is lost, is adopted instead. Before the questions, when no file for that Worker name is on disk, setup asks the Operator to type the name again if it is such a Deployment. Adopting needs a Worker whose Hyperdrive binding is a config named after it, which is how setup makes them. It then rebuilds the file from the Worker's current settings and that config, asking nothing else: the `vars`, including `BOUNDARY` and the `IDP_*` values, the Hyperdrive config's id, and the Database account from its user. The next deploy therefore changes nothing (D-110).
3. **Creates the Database account's SQL.** It generates the password, computes its SCRAM-SHA-256 verifier, prints `database-account.sql` filled in, and waits while the Operator runs it in Supabase and reads its listing.
4. **Creates the Hyperdrive config,** named after the Worker, with caching disabled (D-079). If one of that name exists, it asks whether to reuse it, with its connection details updated to these answers, or stop.
5. **Writes `wrangler.<worker name>.jsonc`** at the package root. `.gitignore` covers `wrangler.*.jsonc`, so an Operator's config never reaches this repository. The file holds only the Operator's own part: `name`, `account_id`, the Hyperdrive config's id and `vars`.
6. **Sets `SERVER_SECRET`,** generated as 32 random bytes in base64url. If the Worker already has one, it is kept, so a rerun does not void Sign-ins.
7. **Deploys,** as `npm run setup -- deploy` does, below.
8. **Runs the smoke checks** against the printed URL. It retries for up to two minutes while a new `workers.dev` hostname starts resolving.
9. **Prints the next steps:** the Deployment's URL, the redirect URI `<url>/oauth/callback` for the Identity provider, and the command for the next step.

**Rerunning.** Rerun with the same Worker name, after a stop or to change an answer, `npm run setup` resumes. It finds the config file and the Hyperdrive config the earlier run made, and updates only the fields this run asked about. Everything else in the file is kept, including Boundary table exclusions and the `IDP_*` values. It then continues from step 6. Nothing is created twice. For the Database account:
- **If the Hyperdrive config exists and the Database account answer is unchanged,** step 3 is skipped and its password kept. A changed answer runs step 3 for the new role, and Hyperdrive gets that role and a new password (D-110). The old role is left as it was; the guide says to drop it.
- **If the role exists but no Hyperdrive config does,** the earlier run stopped after the Operator ran its SQL, and that password is gone. Step 3 then generates a new password and prints the same SQL with its verifier, which resets the password of the role setup marked for this Deployment, and waits while the Operator runs it (D-109).

**Other commands:**
- `npm run setup -- deploy` asks for the Worker name, if more than one config is on disk. It merges `wrangler.template.jsonc` with the Operator's file into a generated config, deploys it with `wrangler deploy -c`, deletes the generated file, and runs the smoke checks. Because the shared fields come from the current template on every deploy, a `git pull` upgrade never deploys stale ones (D-106).
- `npm run setup -- signin` asks for the Worker name, `IDP_ISSUER` (offering Entra's form with a tenant id to fill in) and `IDP_CLIENT_ID`. It asks for `IDP_CLIENT_SECRET` as hidden input. It writes the first two into the config's `vars`, sets the secret, redeploys, and runs `scripts/smoke-signin.mjs`. Rerun, it replaces them, which is how the client secret is rotated.
- `npm run setup -- password` asks for the Worker name. It generates a new password, prints `ALTER ROLE` with its verifier, and waits while the Operator runs it. Then it updates the Hyperdrive config and runs the smoke checks.
- `npm run setup -- remove` asks for the Worker name, then deletes that Worker, its Hyperdrive config and its config file, after the Operator types the name again to confirm. It deletes nothing it cannot name from that config file. It prints SQL that drops the role only if it carries this Deployment's mark (D-110), and the guide gives the steps to delete the Entra app registration.

**Secrets.** No secret appears in the arguments of any command the setup command runs, and none is written to a file, echoed or logged:
- `SERVER_SECRET` and `IDP_CLIENT_SECRET` reach Wrangler on standard input.
- The Database account's password is made by the command and held in memory only. Supabase receives its SCRAM verifier, never the password.
- That password goes only in the body of a request to Cloudflare's Hyperdrive API, to create or update the config. Wrangler's own Hyperdrive commands take it only as an argument (Wrangler 4.149), so they are not used for it. The request is authorised with the token Wrangler's sign-in already holds, read through `wrangler auth token`, so the Operator creates no extra credential (D-103).

Wrangler is always run as `process.execPath` with `node_modules/wrangler/bin/wrangler.js` and an argument array, never through a shell, `npx` or `npm`. That way npm logs no command line, and on Windows no `.cmd` shim or `cmd.exe` is involved.

**The template and the Operator's file.** `wrangler.template.jsonc` holds what every Deployment shares:
- `main`, `compatibility_date`, `compatibility_flags` and `define`;
- `observability`, enabled at a sampling rate of 1;
- the `version_metadata` binding;
- the `hyperdrive` binding's name;
- `ENGINE` `postgres`.

A test keeps those fields equal to the project's own `wrangler.jsonc`, so a slice that changes one in one place fails until it changes both.

The Operator's file holds `name`, `account_id`, the Hyperdrive config's id, and `vars`: `ROW_LIMIT` and, when set, `BOUNDARY` and the `IDP_*` values. `PERMISSION_TIER` and `REDACTION` are left unset, which makes them `read-only` and `on` (D-019, D-007).

`IDP_*` are absent until the `signin` step. Until then the Deployment refuses every Tool call, because no one can sign in (D-017).

## Interface
No change to the Server. New: `npm run setup` with its `deploy`, `signin`, `password` and `remove` forms, `database-account.sql` and `wrangler.template.jsonc`. `.gitignore` gains `/wrangler.*.jsonc`, anchored at the package root, so the template under `deploy/cloudflare/` stays committed.

## Data
No change to the Server's data. The Database account is created in the Operator's own Database by the script above.

## The deployment trial log
`docs/deployment-trials.md`. One entry per trial, newest first, holding:
- who ran it, and how new to the project they were;
- the date, the commit, the Workers plan, and the Database (host and project, never credentials);
- clock times for each of these:
  - opening the README;
  - the Deployment deployed, connected and reachable (the smoke checks pass). This is R-013's hour;
  - Sign-in working (`smoke-signin` passes);
  - the first question answered in an AI tool;
- every place they stalled or needed something the docs did not give, with what was changed in the docs as a result.

## Proven by
- **The setup command, by tests against a fake Wrangler and a fake Cloudflare API:**
  - it builds the config, the Wrangler calls and the Hyperdrive request named above from its answers;
  - it refuses `postgres` at the question, before any call. It stops at the first failed step and says what to do;
  - with a sign-in that reaches two accounts, it asks which to use. The chosen `account_id` is in the config and in every call and request;
  - it refuses a Worker that exists with no config on disk. It adopts one whose same-named Hyperdrive config exists, only after the name is typed again;
  - a rerun after a stop at any step resumes. It creates no second Hyperdrive config and keeps `SERVER_SECRET`. A stop between the role's SQL and the Hyperdrive config leads to an `ALTER ROLE` with a new verifier;
  - a rerun keeps every field of the Operator's file that it did not ask about, Boundary table exclusions and `IDP_*` included. Adoption writes back the Worker's current `vars`, read from Cloudflare;
  - no secret appears in any argument it passes, and none in a file, its output or the config. The Database account's password appears nowhere in the printed SQL, only its verifier;
  - every Wrangler call runs as `process.execPath` with Wrangler's JS entry and no shell;
  - `deploy` merges the current template with the Operator's file, and deletes the merged file after deploying;
  - `signin`, `password` and `remove` do what is listed above, and `remove` touches only what the config file names;
  - the smoke step retries for up to two minutes, then fails.
- **The config, by Wrangler itself and by a test:**
  - a merged config passes `wrangler deploy --dry-run`;
  - the template's shared fields equal the project's own `wrangler.jsonc`.
- **`database-account.sql`, filled in by the setup command and run against Docker PostgreSQL:**
  - it creates a role that passes the D-077 check and connects with the generated password;
  - its listing is empty;
  - a second run for the same Deployment gives the role setup made a new password; a run for another Deployment, including one with the same Worker name in another Cloudflare account, or naming a role made otherwise, changes nothing (D-109, D-110);
  - the removal SQL drops only the role carrying this Deployment's mark.

  After `GRANT SELECT ON … TO PUBLIC` on a test table, the listing names that table.
- **The docs, by tests:**
  - the guide names every Server setting and secret environments.md lists for Cloudflare;
  - it explains each of `/healthz`'s three failure reports;
  - it gives the smoke checks as `curl` commands;
  - it names every Wrangler command and API call the setup command makes;
  - it gives an entry for every signal in operations.md's monitoring table, each with that table's threshold for calling a human;
  - the README names the supported pairings and AI tools, the planned ones, and Workers Logs' retention.
- **Live, the trial (T-008):** the product owner follows only the README and the guide, from a fresh clone. They deploy a trial Deployment in their Cloudflare account, against the AI Golf App Supabase project. The trial uses names no other Deployment uses: Worker and Hyperdrive config `sql-mcp-trial`, Database account `sqlmcp_trial`, and a new Entra app registration. The project test Deployment's `sql-mcp-server` and `sqlmcp_reader` are untouched, and its smoke checks pass after the trial.
  - Deployed, connected and reachable within **60 minutes** of opening the README (R-013, PRD).
  - Sign-in set up, and Claude and ChatGPT each answer one question from a table the trial granted to `sqlmcp_trial`.
  - The trial log holds the entry above. It says the runner wrote the Server and is not new to the project, so the time is a floor, not the PRD's measurement (D-100).
  - The trial Deployment is then removed with `npm run setup -- remove` and the guide's steps for the role and the app registration. Nothing of it remains: no Worker, no Hyperdrive config, no `sqlmcp_trial` role, no app registration.

## Out of scope
- **A trial by an engineer new to the project,** which the PRD metric names. This slice's trial is the product owner's (D-100). A trial by someone new is owed before the release ships. Q-039 blocks the release on it, and the trial log keeps the PRD's wording.
- **Private Deployments** (D-064).
- **Other PostgreSQL hosts** than Supabase (D-063).
- **MS SQL Server on Azure,** and its Bicep template and trial: S-006 and S-007.
- **Identity providers other than Entra ID.** The guide says any OpenID Connect provider that publishes discovery should work, and that only Entra ID is tested (D-073).
- **Release tags and CI-built artifacts** (operations.md). Until the first release is tagged, the kit deploys from a clone of the repository's default branch, and upgrades by `git pull` and redeploying (D-104). Q-039 owes the tagged release before the release ships.
- **Monitoring set up automatically.** The guide documents each signal and where to watch it, and sets nothing up. On Cloudflare the platform cannot run a health probe, so `/healthz` needs an external monitor.

## Tasks

### T-001 — The setup command turns the Operator's answers into a config and a deployed Worker, and stops at the first failure
Verified by: setup_builds_config_from_answers, setup_runs_steps_in_order, setup_stops_at_first_failure_and_says_what_to_do, setup_refuses_postgres_account_at_the_question, setup_asks_which_cloudflare_account, setup_refuses_worker_it_did_not_make, setup_adopts_its_own_worker_after_confirmation, setup_smoke_retries_then_fails, setup_reuses_hyperdrive_with_new_password, setup_reports_cloudflare_errors_and_unreadable_output

### T-002 — A rerun resumes where the last run stopped
Verified by: setup_rerun_resumes_without_duplicates, setup_rerun_keeps_server_secret, setup_rerun_resets_password_of_orphaned_role, setup_rerun_keeps_unasked_fields, setup_adoption_restores_worker_vars, setup_reads_server_secret_from_worker_settings, setup_rerun_with_new_role_prints_its_sql

### T-003 — The setup command keeps secrets out of arguments, files and output
Verified by: setup_passes_secrets_on_stdin, setup_sends_database_password_only_in_api_body, setup_prints_only_the_password_verifier, setup_writes_no_secret_to_config_or_output, setup_runs_wrangler_without_shell

### T-004 — An Operator can set up Sign-in, rotate the Database password and remove a Deployment with the setup command
Verified by: setup_signin_sets_idp_and_redeploys, setup_password_updates_role_and_hyperdrive, setup_remove_deletes_only_what_config_names, setup_forms_ask_worker_only_with_choice

### T-005 — Every deploy uses the current shared config, and that config deploys
Verified by: setup_deploy_merges_current_template, template_matches_project_config, setup_config_passes_wrangler_dry_run

### T-006 — The Database account SQL creates a safe, empty role, resets or drops only the role setup made for this Deployment, and lists what the role can read
Verified by: database_account_sql_creates_safe_role, database_account_sql_resets_only_its_own_role, database_account_drop_sql_drops_only_its_own_role, database_account_sql_lists_public_grants, database_account_sql_lists_what_server_sees

### T-007 — The README, guide and Staff guide cover what an Operator and a Staff member need
Verified by: kit_guide_names_every_cloudflare_setting, kit_guide_explains_healthz_failures, kit_guide_gives_smoke_checks_as_curl, kit_guide_names_every_setup_call, kit_guide_covers_every_monitoring_signal, readme_states_pairings_ai_tools_and_retention, staff_guide_covers_claude_chatgpt_and_refusals

### T-008 — The deployment trial is run and recorded
Verified by: manual — the product owner runs the trial described under Proven by, from a fresh clone, with the trial's own names. Its entry in `docs/deployment-trials.md` records the times and every stall, and the docs are fixed for each stall. The trial Deployment is then removed, and the project test Deployment's smoke checks pass. Done when R-013's hour is met. A trial over the hour raises a Q-### naming where the time went. The trial clones prinsloo-ai, as the guide says, and works in the clean copy T-009 publishes, `mcp/sql-mcp`.

### T-009 — The Server and its Deployment kit are published as a clean copy, `mcp/sql-mcp` (D-111)
Added after deploy, on the product owner's decision. An export script builds the clean copy, in the folder `mcp/sql-mcp` beside this one, from an explicit list of what to include. It builds and checks the copy in a staging folder. It refuses the copy, leaving the target as it was, if any reference to this development process or any identifier of the project test Deployment remains. It replaces only an earlier clean copy, and keeps that copy's installed packages and local files. The copy installs and passes its own tests on its own. The guide's clone command leads to the clean copy. The settings reference the guide links to matches the system spec's variables, limits and monitoring tables, apart from the differences D-112 records.
Verified by: export_includes_only_listed_files, export_leaves_no_process_reference, export_strips_project_identifiers, settings_reference_matches_system_spec, constructs_reference_matches_system_spec, export_replaces_only_an_earlier_copy, guide_clones_the_clean_copy, and manual — the exported tree, in a folder of its own, passes `npm ci`, `npm run typecheck` and `npm test`, and the product owner confirms where it lives, its licence holder and its version.

## Critique findings — slice-spec, 2026-10-31

Fresh-context critique. The lint's `next` run reported nothing for this phase. Size `product`, so `gap_policy` is `hold`.

Checklist:
1. Delivers is observable: a Deployment someone can reach, Staff members' answers, and a trial log entry. No finding.
2. Vertical: the slice runs from the docs and the setup command through to a live Deployment and an AI tool's answer. There is no Server change, and none is needed. No finding.
3. States: there are no screens (D-046). No finding.
4. Proven-by lines can be run, and R-013's 60 minutes and the Row limit default are carried. One line has no test behind it (nit 2).
5. Tasks are outcomes. T-007 reads like an activity, but its done-condition is an outcome. No finding.
6. Verified-by: `database_account_script_creates_safe_role` can pass while the Supabase Deployment it stands for shows objects (blocker 2). `setup_runs_wrangler_binary_directly` can pass while running a `.cmd` shim through `cmd.exe` (gap 2).
7. System-level decisions: deploying from a clone instead of a release, which sets aside operations.md's release model with no register entry (gap 5). The file naming, log location and role name are system-ish too, but D-103 records them.
8. Out of scope that hides a dependency: release tags (gap 5). Monitoring, private Deployments, other hosts and other providers hide nothing.
9. Partial traces: R-013 is only partly delivered, by D-100's design, and the owed trial is not tracked anywhere that blocks (gap 6). J-001 and R-001 (Cloudflare half, under D-063) are delivered.

### blocker — the trial Deployment uses the same names as the project test Deployment, and removing it would delete the test Deployment's role
Evidence: the trial runs "in their Cloudflare account, against the AI Golf App Supabase project, with a new Database account" and is then removed so that there is "no Worker, no Hyperdrive config, no role" (Proven by). But `database-account.sql` has "one placeholder, the password" and creates the fixed role `sqlmcp_reader` (D-103), which already exists in that project as the project test Deployment's account (environments.md, S-002 deploy.md line 7). The setup command's default Worker name, `sql-mcp-server`, is also the project test Deployment's Worker in the product owner's account (wrangler.jsonc). The rerun guard only looks for a local `wrangler.<worker name>.jsonc`, and that file does not exist for the project's own Worker, so nothing stops the collision.
Consequence: at build, the script and the setup command will be written with no way to choose a different role name and no check against Workers already in the account. At T-007, the script finds the role already there and "changes nothing", so there is no new Database account and the trial cannot set the password it was given. If the trial accepts the default Worker name, setup also overwrites the test Worker's `SERVER_SECRET`, `vars` and Hyperdrive binding. The guide's removal step then drops `sqlmcp_reader` and possibly the Worker as well, which takes down the Deployment that the release test harness and S-004's benchmark run against. Possible fixes: make the role name a second placeholder, have setup refuse a Worker name that already exists in the account (or confirm it with `wrangler deployments list`), and name distinct trial names in Proven by.

### blocker — Supabase's own `PUBLIC` grants contradict "sees only Created objects", and the test runs where they do not exist
Evidence: "A Deployment using it … sees only Created objects until the Database administrator grants something (D-075)" (`database-account.sql`); the Boundary question defaults to "none, meaning no Boundary"; the proof is "run twice against Docker PostgreSQL … sees nothing on the Allow-list". S-002's deploy record (line 28) says: "An Operator Deployment with no Boundary against Supabase would show whatever Supabase grants `PUBLIC` [`extensions`, `auth`, `storage` and others], which S-005's Deployment kit has to address." `src/visibility.ts` excludes only `pg_catalog`, `information_schema`, `pg_toast*` and `pg_temp*`. The spec does not mention this anywhere.
Consequence: at build, the docs and the script will claim the new account starts empty, and T-005's test will pass on Docker, which has none of Supabase's `PUBLIC` grants. Every Operator who takes the default Boundary will then expose Supabase's internal objects to Staff members' Agents. The fix needs a decision the kit does not have yet: default the Boundary question to the Operator's schemas (for example `public`), warn and list what `PUBLIC` reaches, or check this live. It should be raised as a Q-### or a human D-###, and T-005 or T-007 needs a proof against Supabase.

### gap — a setup run that stops partway has no way forward
Evidence: setup stops "at the first failure with what failed and what to do". It creates Hyperdrive (step 3) and writes the config (step 4) before setting the secret, deploying and running the smoke checks (steps 5–7). "Rerunning `npm run setup` for a Worker name whose config exists stops and says so." The spec never says what the Hyperdrive config is named, or what happens if setup fails after step 3. The guide outline has no section on fixing a wrong host or password (`wrangler hyperdrive update`). D-102 justifies the command by saying "each step is a Wrangler command the guide also names", but guide section 3 covers only "what it asks, and what each answer becomes".
Consequence: at build, a recovery path will be invented or left out. The likeliest first-run failures are a wrong pooler password, which smoke reports as `database: unreachable` after step 4, and a fresh account's `workers.dev` subdomain that is not registered yet or not yet resolving. Either one leaves an Operator whom the rerun guard blocks and the guide does not help. That is J-001's "stall past the hour" exit, and the product owner's own trial, on an account that already has a subdomain and with no typos, will not hit it.

### gap — "Wrangler's own binary" is unspecified on Windows, where the trial runs
Evidence: "runs Wrangler's own binary as a child process, never through `npx` or `npm`" (Secrets). The Verified-by test is `setup_runs_wrangler_binary_directly`. On Windows, `node_modules/.bin/wrangler` is a `.cmd` shim, and Node 24 will only spawn one through a shell. The shell (`cmd.exe`) then puts the password on its own command line and interprets `&`, `^`, `%` and `"` in it.
Consequence: at build, the code will either fail on Windows or pass `shell: true`, which garbles or exposes passwords that contain those characters. The test checks only that `npx` is not used, so it passes either way, and T-007 finds the problem live on the product owner's Windows machine. The spec should name the actual invocation (`process.execPath` with Wrangler's JS entry, `node_modules/wrangler/bin/wrangler.js`).

### gap — the guide does not cover rotating `IDP_CLIENT_SECRET` or the Database account's password
Evidence: guide section 8 lists only "rotating `SERVER_SECRET` (security.md)". security.md's Secrets section ends those two rotations with a redeploy. On Cloudflare a redeploy does not change the password held in Hyperdrive. That takes `wrangler hyperdrive update`, which also takes the password only as an argument.
Consequence: at build, the guide will be written without these steps. Entra client secrets expire, after 24 months at most, so every Operator's Sign-in eventually breaks with no documented fix. An Operator who follows security.md's "redeploy" after changing the Database password in Supabase gets `database: unreachable` instead.

### gap — the README omits D-043's AI tool scope
Evidence: the README row covers "what the Server does, the two pairings … and that AWS is planned, what a Deployment needs". The PRD scope (line 18) and D-043 say "The README says support is planned" for Copilot and other AI tools. The only README test is `readme_states_supported_pairings`.
Consequence: at build, the README will be written without the supported AI tools (Claude and ChatGPT) or the planned ones. J-001 step 1, where the Operator checks fit before investing time, then misses whether staff's AI tool works, and D-043's README commitment ships unmet with no test noticing.

### gap — deploying from a clone sets aside operations.md's release model, with no Q-### or D-### and no upgrade path
Evidence: Out of scope: "Release tags and CI-built artifacts (operations.md). The kit deploys from a clone of the repository. A versioned release is a later decision." operations.md: "A release is a git tag `vX.Y.Z`. CI builds … the Worker bundle", and "The rollback procedure checks the release notes for a `v` change first", a procedure guide section 8 points to. The guide has no section on moving a Deployment to a newer Server.
Consequence: deferring "a later decision" in prose is what this gate exists to catch. S-006's kit, which ships a CI-built image, will settle the release question differently. At build, the guide's rollback section will cite release notes that do not exist for a clone, and Operators who `git pull` and redeploy across a token-format change will void every Sign-in without warning. It needs a Q-### or D-### naming which ref Operators deploy and how they upgrade.

### gap — the PRD metric's trial is "owed for the release" but nothing blocks the release on it
Evidence: Out of scope: "A trial by someone new stays owed for the release … (Q-038)". Q-038 reads "Blocks: nothing; apply at the next revision of each document". Traces: R-013.
Consequence: once S-005 is verified, the lint counts R-013 as covered, and Q-038 is filed as a list of document corrections. The release then ships with the PRD's deployment-time metric never measured by the engineer it names, which is the partial-trace failure checklist item 9 describes. Q-038, or a separate entry, should block the release, or a slice should own the trial.

### nit — the `postgres` refusal is said to come "before any call", but `whoami` comes first
Evidence: step 2 "refuses the account name `postgres` … before any call" follows step 1, `wrangler whoami`. Proven by says "it refuses `postgres` before calling Wrangler".
Consequence: at build, `setup_refuses_postgres_account` will be written against one ordering or the other. Refusing at answer time satisfies both.

### nit — `/healthz`'s three failure reports have no named test
Evidence: Proven by (docs): "the guide names every Server setting … `/healthz`'s three failure reports, and the smoke checks as `curl` commands". T-006's three tests cover the settings, the curl checks and the README.
Consequence: at build, that clause may go untested unless `kit_guide_names_every_cloudflare_setting` quietly takes it on.

### nit — D-103 rejects only an API token, not the OAuth token Wrangler already holds
Evidence: D-103: "asking the Operator for a Cloudflare API token to call Hyperdrive's API, which is one more credential". Wrangler 4.149 has `wrangler auth token`, which returns the token from `wrangler login`. With it, setup could send the password in a Hyperdrive API request body and keep it out of the process list.
Consequence: at build, the argument route will be implemented on the strength of a rejected alternative that missed this option. The human confirming D-103 should know about it, and so should security.md's rule that the Database password lives only in the secret store.

Verdict: fail (2 blockers, 6 gaps, 3 nits)

Revision 2, 2026-10-31:
- **Trial names** → `database-account.sql` takes the role's name as a placeholder and stops if the role exists. The setup command has no default Worker name, and refuses a Worker that exists with no config on disk. The trial uses `sql-mcp-trial` and `sqlmcp_trial`, and checks afterwards that the project test Deployment still passes its smoke checks.
- **`PUBLIC` grants** → checked on the AI Golf App project on 2026-10-31: a login role with no grants reads no table or view outside the schemas granted to it. The script now ends by listing what the new role can read. The guide says to set a Boundary if that list is not empty (D-105). A test grants a table to `PUBLIC` on Docker and expects the listing to name it.
- **Recovery** → the Hyperdrive config is named after the Worker. A rerun resumes, updating rather than duplicating, and keeps `SERVER_SECRET`. Setup checks for a `workers.dev` subdomain, and the smoke step retries for two minutes. The guide names every Wrangler command and API call setup makes.
- **Windows** → Wrangler runs as `process.execPath` with `node_modules/wrangler/bin/wrangler.js` and no shell.
- **Rotation** → `npm run setup -- signin` rotates the client secret, and `npm run setup -- password` updates Hyperdrive's password. The guide covers both, and says a redeploy alone does not change Hyperdrive's password.
- **README** → it names Claude and ChatGPT as supported and other AI tools as planned (D-043), and a test checks it.
- **Release model** → D-104: deploying from the default branch, upgrading by `git pull` and redeploying, and rollback while releases have no notes. Q-039 owes the tagged release and blocks the release.
- **The owed trial** → Q-039 blocks the release on a trial by an engineer new to the project.
- **Nits** → `postgres` is refused at the question. `/healthz`'s failures have their own test. D-103 now sends the password in a Hyperdrive API request authorised by `wrangler auth token`, so no secret appears in any argument.

## Critique findings — slice-spec, gate 2, 2026-10-31

Fresh-context critique. The lint's `next` run reported nothing for this phase. Size `product`, so `gap_policy` is `hold`. Checked against the slice backlog, the discovery document, the journeys, the PRD, the domain model, the architecture, the system spec, the decisions and questions named in the brief, S-002's deploy record, the code the spec makes claims about, and Wrangler 4.149's own help and source (`wrangler auth token` itself was not run).

Gate-1 findings, each checked:
- **Trial names (blocker):** resolved. The role name is a placeholder, setup has no default Worker name, and step 2 refuses `sql-mcp-server` on the product owner's machine, because its config is `wrangler.jsonc`, not `wrangler.sql-mcp-server.jsonc`. The trial's names are distinct, and the test Deployment's smoke checks are re-run afterwards.
- **`PUBLIC` grants (blocker):** resolved by D-105, the script's final listing, the Docker `GRANT … TO PUBLIC` test and the live check on the AI Golf App project. This does not contradict D-075, because the Boundary stays unset by default.
- **Recovery:** resolved. The Hyperdrive config is named after the Worker, a rerun resumes, there is a subdomain check, the smoke step retries, and the guide has troubleshooting entries. Wrangler's source confirms that step 5's `secret put` on a Worker that does not exist yet creates a draft Worker without prompting when stdin is not a terminal, so first-run ordering works.
- **Windows:** resolved. `node_modules/wrangler/bin/wrangler.js` exists.
- **Rotation:** resolved. The `signin` and `password` forms are added, and the guide covers both.
- **README:** resolved, and `readme_states_pairings_and_ai_tools` tests it.
- **Release model:** resolved by D-104 and Q-039 (Blocks: the release). `git log -S'const VERSION'` shows `v` unchanged since S-001, as D-104 says.
- **Owed trial:** resolved. Q-039 blocks the release.
- **Nits:** all three resolved.

Checklist:
1. Delivers is observable: a reachable Deployment, Staff members' answers in Claude and ChatGPT, and a trial log entry with clock times. It now follows D-099 (R-013's hour, with the rest logged). No finding.
2. Vertical: the slice runs from the README through the setup command and the SQL script to a live Deployment that an AI tool answers through. No Server change is needed. `src/config.ts` treats unset `IDP_*` as valid and `src/app.ts` still serves `/healthz` and both metadata documents, so `scripts/smoke.mjs` passes before Sign-in, as step 7 needs. No finding.
3. States: there are no screens (D-046). No finding.
4. Proven-by lines can be run. R-013's 60 minutes, the Row limit default of 500, the two-minute retry and the 32-byte secret are all carried. No finding. The monitoring signals operations.md asks the kit to document have no proof because they have no content (gap 5).
5. Tasks are outcomes, except T-004's title (nit 3).
6. Verified-by: every test name maps to a Proven-by line. None is a test that cannot fail. `setup_config_passes_wrangler_dry_run` proves only that the config is valid, which is all it claims. No finding.
7. System-level decisions: the release model (D-104), the file and log names (D-103) and the `PUBLIC` handling (D-105) are each on the register, model-decided, for confirmation at verification. D-103's use of the Hyperdrive API departs from the letter of D-102 (nit 2). The Free-plan claim leaves the release build's bundle limit at Paid's 10 MiB (nit 1).
8. Out of scope that hides a dependency: none of the listed deferrals hides one. Monitoring is deferred only for `/healthz`, and the other signals are neither built nor deferred (gap 5).
9. Partial traces: R-013 is held to its own hour (D-099), and the PRD's run by an engineer new to the project is blocked on by Q-039. J-001's steps 1 to 6 are each covered, step 6 by the smoke checks' 401. R-001 is covered for its Cloudflare part, as D-063 allows. No finding.

### gap — the setup command never says which Cloudflare account it acts on
Evidence: step 1 checks `wrangler whoami`, and the Database password goes "only in the body of a request to Cloudflare's Hyperdrive API" (Secrets). That API is `/accounts/<account id>/hyperdrive/configs`, and the subdomain and existing-Worker checks in steps 1 and 2 are per-account too. The template lists no `account_id`, and nothing in the spec says where the account ID comes from. In Wrangler 4.149, a login with more than one account fails in non-interactive mode ("More than one account available but unable to select one in non-interactive mode", `wrangler-dist/cli.js`). `secret put` with the secret on stdin is non-interactive.
Consequence: at build, the account ID will be invented, most likely as the first account `whoami` lists. An Operator whose login reaches several accounts, which is common for anyone in an organisation's Cloudflare, either has setup fail at step 5, or has the Hyperdrive config created in one account and the Worker deployed in another. The product owner's single-account trial will not find this. Setup should ask, or choose only when there is one account, and write `account_id` into the config. The tests should cover a login with two accounts.

### gap — the Database account's password goes into Supabase's SQL editor as plaintext
Evidence: "`database-account.sql`: Run as `postgres` in the Supabase SQL editor, after replacing two placeholders at its top: the role's name … and its password." The Secrets section keeps the password out of process arguments, files and output, but only for the setup command. S-002's deploy record shows the project avoided exactly this: "Its password was generated locally, and Supabase received only its SCRAM-SHA-256 verifier." security.md: secrets "live only in the platform's secret store".
Consequence: at build, the script will take a cleartext password. Every Operator's Database account password then sits in Supabase's saved SQL editor snippets, readable by every member of the Supabase project. It may also reach the server log, as PostgreSQL's own docs warn for `CREATE ROLE … PASSWORD`. An Operator who edits the tracked file in their clone also leaves it in a working-tree file that `git pull` must step around. One fix: setup generates the password, sends it to Hyperdrive, and prints the `CREATE ROLE` line with only the SCRAM verifier. Otherwise, record a decision that plaintext is accepted, and why.

### gap — upgrading by `git pull` and redeploying keeps a config the template has since changed
Evidence: "moving to a newer Server: `git pull`, then `npm run deploy -- -c wrangler.<worker name>.jsonc` (D-104)". The written config copies "the package's `main`, `compatibility_date`, `compatibility_flags` and `define`" and fixed bindings at setup time. S-003 had to add `define` for the parser's glue (wrangler.jsonc: "which Workers do not define (S-003)"), and S-004 added `version_metadata`. A later slice that changes these, or adds a binding, changes `wrangler.jsonc` only.
Consequence: at build, the guide's upgrade path will deploy new code with the old template fields. The next slice that changes a flag, a `define` or a binding breaks every Operator's upgrade, possibly in a way only Staff members' Tool calls show, since `/healthz` does not load the parser. The upgrade should rerun `npm run setup`, so the config is rewritten from the template with the answers kept. Otherwise the deploy step should merge the template fields from `wrangler.jsonc`, with a test that a template change reaches an existing config.

### gap — losing the Operator's config file locks them out of their own Deployment
Evidence: the config is gitignored and on one machine only (step 4). Step 2 stops if "a Worker of that name exists in the account and no `wrangler.<worker name>.jsonc` is on disk". `remove` "deletes nothing it cannot name from that config file", and upgrades and redeploys use `-c wrangler.<worker name>.jsonc`. The guide outline never tells the Operator to keep the file.
Consequence: at build, nothing will be written about it. An Operator who re-clones, changes machines, or hands the Deployment to a colleague can no longer rerun setup, redeploy, rotate through setup, or remove the Deployment through the kit. The guard built against takeover then blocks the rightful owner. The guide should say the file is the Deployment's record and how to keep it, or setup should rebuild it from the Worker's and Hyperdrive's own settings when the Operator confirms the Worker is theirs.

### gap — operations.md's monitoring signals, other than `/healthz`, are neither documented nor deferred
Evidence: operations.md's monitoring section gives the Deployment kit these signals to set up or document. Its table also lists Database errors (more than 10 in 5 minutes), Identity provider failures, `signin_error`/`server_fault`, `config_invalid` and 5xx above 1%. The spec's guide has only "watching `/healthz` with an external monitor", and Out of scope defers only the automatic health probe.
Consequence: at build, the guide will cover `/healthz` alone. A Cloudflare Operator then has no documented way to learn of `config_invalid`, `server_fault` or Identity provider outages, and the thresholds operations.md sets are never handed to the person who must configure them. The guide should cover each signal, by Workers Logs query or alert, or the rest should be deferred with a Q-### or D-###.

### nit — the guide will tell Operators Free works, while the release build checks Paid's limit
Evidence: guide section 1 says "Workers Free runs the Server" (D-101). operations.md's limit is "under 10 MiB gzipped (Workers paid plan). Fitting the free plan is not promised". Workers Free's limit is 3 MiB. Q-038's correction covers the stale wording, not the limit.
Consequence: at a later slice's build, the bundle can pass 3 MiB with the release build still green, and Free Operators' deploys then fail. Adding the 3 MiB limit to Q-038's operations.md correction keeps D-101 true.

### nit — D-103's Hyperdrive API call departs from the letter of D-102
Evidence: D-102 (human): setup "runs Wrangler's own commands: Hyperdrive with caching disabled … each step is a Wrangler command the guide also names". D-103 (model) replaces the Hyperdrive step with a direct API request.
Consequence: none for build, since the guide still names the call and ADR-009's concern, click-through work, is met. The human confirming D-103 at verification should see that it narrows D-102, and that an Operator finishing that step by hand has only `--password` on a command line or the same API call.

### nit — T-004's title names topics, not an outcome
Evidence: "T-004 — Sign-in, password rotation and removal".
Consequence: small, because its three tests are specific. A title like "`signin`, `password` and `remove` change only what they name" would match the Proven-by line it stands for.

### nit — Workers Logs' fixed retention is left to section 8, after the Operator has deployed
Evidence: operations.md says an Operator whose retention policy needs more than Workers Logs keeps "cannot meet it on Cloudflare … the Deployment kit [says] so". The spec puts "retention" under guide section 8, Running it. Section 1 mentions 3 versus 7 days only as a reason to choose Paid.
Consequence: at build, the fit check J-001 step 1 asks for ("before investing time") may miss it, and such an Operator finds out after deploying. One line in section 1 or the README covers it.

Verdict: hold (0 blockers, 5 gaps, 4 nits)

Resolved by the product owner, 2026-11-01: "Fix all five", the first option offered. Revision 3:
- **Cloudflare account** → setup asks which account when the sign-in reaches more than one, and writes `account_id` to the config.
- **Password in Supabase** → setup generates the password and prints the SQL with only its SCRAM-SHA-256 verifier. The password itself reaches only Hyperdrive (D-106).
- **Stale config on upgrade** → the shared fields live in `wrangler.template.jsonc`. Every deploy, through `npm run setup -- deploy`, merges the current template with the Operator's own file. A test keeps the template equal to the project's own config (D-106).
- **Lost config file** → the guide says to keep a backup. Setup adopts a Worker it made, recognised by the Hyperdrive config of the same name, once the Operator types the name again (D-106).
- **Monitoring** → guide section 8 gives an entry for each signal in operations.md's monitoring table, and a test checks every signal has one.
- **Nits** → Q-038 now carries Workers Free's bundle limit. D-103 says where it departs from D-102. T-004's title names an outcome. Retention is in the README and in the guide's section 1.

## Critique findings — slice-spec, gate 3, 2026-11-01

Fresh-context critique. The lint's `next` run reported nothing for this phase. Size `product`, so `gap_policy` is `hold`. Checked against the slice backlog, the discovery document, the journeys, the PRD, the domain model, the architecture, the system spec, the decisions and questions named in the brief, S-002's deploy record, the code the spec makes claims about (`src/config.ts`, `src/visibility.ts`, `src/signin/tokens.ts`, both smoke scripts, `package.json`, `wrangler.jsonc`, `.gitignore`), and Wrangler 4.149's help (`wrangler auth token` exists; `rollback` takes `--name`; `deploy` takes `-c` and `--dry-run`). `wrangler auth token` itself was not run.

Gate-2 findings, each checked:
- **Cloudflare account (gap):** resolved. The question is asked only when the sign-in reaches more than one account, `account_id` goes into the Operator's file and every call, and a Proven-by line and `setup_asks_which_cloudflare_account` cover two accounts.
- **Password in Supabase (gap):** resolved by D-106. The password is generated and never shown, the SQL carries only the SCRAM-SHA-256 verifier, the `password` form prints `ALTER ROLE` the same way, and `setup_prints_only_the_password_verifier` tests it. The revision opens a new hole in reruns (gap 1 below).
- **Stale config on upgrade (gap):** resolved. The shared fields are in `wrangler.template.jsonc`, every deploy merges them, `template_matches_project_config` keeps them equal to `wrangler.jsonc`, and `setup_config_passes_wrangler_dry_run` would catch a merge that drops the `hyperdrive` binding. `ENGINE` in the template is harmless either way, because `src/config.ts` does not read it.
- **Lost config file (gap):** resolved as D-106 decided: a backup instruction, and adoption when the same-named Hyperdrive config exists, after the name is typed again. How adoption rebuilds the file loses settings (gap 2 below).
- **Monitoring (gap):** resolved. Guide section 8 has an entry for each of operations.md's six signals, with where to watch it and when a human is called, and `kit_guide_covers_every_monitoring_signal` tests it.
- **Nits:** all four resolved. Q-038 carries Free's 3 MiB limit, D-103 names its departure from D-102, T-004's title is an outcome, and retention is in the README and guide section 1.

Checklist:
1. Delivers is observable: a reachable Deployment, Sign-in set up, Staff members' answers in Claude and ChatGPT, and a timed trial log entry. It follows D-099. No finding.
2. Vertical: README, guide, setup command, SQL script and template, through to a live Deployment an AI tool answers through. The Server needs no change: `src/config.ts` leaves Sign-in off while `IDP_*` are unset, and `scripts/smoke.mjs` runs before Sign-in. No finding.
3. States: there are no screens (D-046). No finding.
4. Proven-by lines can be run. R-013's 60 minutes, the Row limit default of 500, the two-minute retry and the 32-byte secrets are carried. The monitoring test does not carry operations.md's thresholds (nit 1). No requirement's number is missing. No finding beyond the nit.
5. Tasks are outcomes, T-001 to T-008. No finding.
6. Verified-by: every test name maps to a Proven-by line, and none of them would pass whatever the code did. `setup_rerun_resumes_without_duplicates` runs against a fake Cloudflare API, so it cannot see the password loss in gap 1, but that is missing content, not a test that cannot fail. No finding.
7. System-level decisions: the file names, the log, the Wrangler invocation and the Hyperdrive API route (D-103), the release ref (D-104), the `PUBLIC` listing (D-105) and the template merge (D-106) are each on the register. All are specific to the Cloudflare kit, and S-006's Bicep kit does not need them. No finding.
8. Out of scope that hides a dependency: none. The new engineer's trial and the tagged release are blocked on by Q-039, private Deployments and other hosts are deferred by D-064 and D-063, and automatic monitoring is replaced by documentation. No finding.
9. Partial traces: R-013 is held to its own hour (D-099), and Q-039 blocks the release on the PRD's own run. J-001's steps 1 to 6 are covered, step 4 as public only (D-064). R-001 is covered for Cloudflare, as D-063 allows. No finding.

### gap — a rerun after the Operator has run the SQL, but before the Hyperdrive config exists, cannot recover the Database account's password
Evidence: step 3 generates the password, which is "held in memory only" and "never shown" (Secrets, D-106). Step 4 then creates the Hyperdrive config. On a rerun, "It skips step 3 when the account's role already connects". If the role already exists, `database-account.sql` "stops and changes nothing". Proven by claims that "a rerun after a stop at any step resumes".
Consequence: a stop between the Operator running the SQL and step 4 succeeding leaves a role whose password no process holds. That stop can be a wrong pooler host, port or project ref (Hyperdrive tests the origin when a config is created), a network error, or Ctrl-C. A new setup process has no password to test whether the role "already connects" with, so at build the check will be invented. It can only go two ways. Setup skips step 3 and gives Hyperdrive a fresh password the role does not have, so the smoke check reports `database: unreachable`. Or it prints the CREATE SQL again, which refuses the existing role. Either way the Operator is stuck at the setup step most likely to fail on a first run, which is J-001's "stall past the hour" exit. `setup -- password` cannot help, because there is no Hyperdrive config for it to update. The fake-API rerun test will pass, and the product owner's trial, run without typos, will not reach this case. The spec needs to name the path. For example: when the role exists and no Hyperdrive config of that name does, the rerun prints `ALTER ROLE` with a new verifier, as the `password` form does. Or the Operator is told to drop the half-made role first.

### gap — rerun and adoption rebuild the Operator's file from answers, dropping table exclusions and `IDP_*`
Evidence: "Adopting rebuilds the config file from this run's answers". A rerun "updates them to the new answers". But "Table exclusions are added by editing the config (guide section 8)", and `IDP_ISSUER` and `IDP_CLIENT_ID` are written only by `npm run setup -- signin`. Neither is among the questions setup asks.
Consequence: at build, the file will be rewritten from the answers, because that is all the spec describes. After an adoption, and on a rerun unless the build chooses to merge, the next deploy drops the Boundary's table exclusions. Tables the Operator had excluded then become visible to Staff members' Agents wherever the Database account is granted them. The deploy also drops `IDP_*`, so every Tool call is refused (D-017) until the Operator reruns `signin` and re-enters a client secret the Worker already holds. Nothing reports the first loss. The second shows up only when Staff members cannot connect. The spec should say that a rerun keeps the file's other fields. It should also say either that adoption reads the Worker's current `vars` back from Cloudflare, or that the guide's lost-file entry tells the Operator to restore exclusions and run `signin` before deploying.

### nit — the monitoring docs test does not check the thresholds
Evidence: guide section 8 says "each entry gives where to watch it on Cloudflare and when a human is called". The Proven-by line is only "it gives an entry for every signal in operations.md's monitoring table".
Consequence: at build, `kit_guide_covers_every_monitoring_signal` will most likely match signal names only. A guide entry without operations.md's threshold (more than 10 Database errors in 5 minutes, and so on) would still pass. Checking each threshold's figure as well closes this.

Verdict: hold (0 blockers, 2 gaps, 1 nit)

Resolved by the product owner, 2026-11-01: "Fix both, then pass", the first option offered. Revision 4:
- **Orphaned role** → a rerun that finds the role but no Hyperdrive config generates a new password, prints `ALTER ROLE` with its verifier, and carries on. Tested by `setup_rerun_resets_password_of_orphaned_role`.
- **Rebuilt file** → a rerun changes only the fields it asked about. Adoption reads the Worker's current `vars` and Hyperdrive binding back from Cloudflare before writing the file. Tested by `setup_rerun_keeps_unasked_fields` and `setup_adoption_restores_worker_vars`.
- **Nit** → the monitoring test checks each signal's threshold too.

The product owner chose to pass the spec after these fixes without a fourth critique (D-107).
