import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseJsonc } from "../../deploy/cloudflare/lib/config.js";
import { roleMark } from "../../deploy/cloudflare/lib/database-account.js";
import { SetupStopped, setup } from "../../deploy/cloudflare/lib/setup.js";
import { wranglerRunner } from "../../deploy/cloudflare/lib/wrangler.js";
import { ACCOUNT, OAUTH_TOKEN, SUBDOMAIN, TRIAL, type World, operatorFile, world } from "./world.js";

const URL_ = `https://${TRIAL.worker}.${SUBDOMAIN}.workers.dev`;
const operator = (w: World, worker = TRIAL.worker) => parseJsonc(w.files.get(operatorFile(worker))!) as Record<string, any>;
const step = (w: World) => w.calls.map((c) => c.args.slice(0, 2).join(" "));
const stopped = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(SetupStopped);
  return (e as SetupStopped).message;
};

describe("the setup command", () => {
  it("setup_builds_config_from_answers", async () => {
    const w = world(TRIAL);
    await setup("setup", w.deps);

    // The Operator's own file holds only their part, and no secret.
    expect(operator(w)).toEqual({
      name: TRIAL.worker,
      account_id: ACCOUNT,
      hyperdrive_id: "hd-1",
      database_account: TRIAL.role,
      vars: { ROW_LIMIT: "500", BOUNDARY: '{"schemas":["sales"]}' },
    });
    // The Hyperdrive config, named after the Worker, with caching disabled.
    const [hd] = [...w.state.hyperdrives.values()];
    expect(hd).toMatchObject({
      name: TRIAL.worker,
      origin: { scheme: "postgres", host: TRIAL.host, port: 5432, database: "postgres", user: `${TRIAL.role}.${TRIAL.projectRef}` },
      caching: { disabled: true },
    });
    // What was deployed is the template merged with the Operator's part.
    const config = w.deployed[0]!.config;
    expect(config).toMatchObject({
      name: TRIAL.worker,
      account_id: ACCOUNT,
      main: "src/worker.ts",
      observability: { enabled: true, head_sampling_rate: 1 },
      version_metadata: { binding: "VERSION_METADATA" },
      hyperdrive: [{ binding: "HYPERDRIVE", id: "hd-1" }],
      vars: { ENGINE: "postgres", ROW_LIMIT: "500", BOUNDARY: '{"schemas":["sales"]}' },
    });
    expect(config.vars).not.toHaveProperty("PERMISSION_TIER");
    expect(config.vars).not.toHaveProperty("REDACTION");
    expect(config.vars).not.toHaveProperty("IDP_ISSUER");
    // No Boundary answer means no Boundary.
    const v = world({ ...TRIAL, worker: "other", schemas: "" });
    await setup("setup", v.deps);
    expect(operator(v, "other").vars).toEqual({ ROW_LIMIT: "500" });
  });

  it("setup_runs_steps_in_order", async () => {
    const w = world(TRIAL);
    await setup("setup", w.deps);
    // A new Worker has no secrets to list, so SERVER_SECRET is put straight away.
    expect(step(w)).toEqual(["whoami --json", "auth token", "secret put", "deploy -c"]);
    // The Database account's SQL is printed and waited on before Hyperdrive is created.
    const sqlAt = w.paused.findIndex((p) => p.includes(`CREATE ROLE "${TRIAL.role}"`));
    expect(sqlAt).toBe(0);
    expect(w.events.indexOf("pause sql")).toBeGreaterThan(-1);
    expect(w.events.indexOf("pause sql")).toBeLessThan(w.events.indexOf("api POST /hyperdrive/configs"));
    expect(w.requests.map((r) => `${r.method} ${new URL(r.url).pathname.replace(/^\/client\/v4\/accounts\/[^/]+/, "")}`)).toEqual([
      "GET /workers/subdomain",
      `GET /workers/scripts/${TRIAL.worker}/settings`,
      "GET /hyperdrive/configs",
      "POST /hyperdrive/configs",
    ]);
    expect(w.scripts).toEqual([{ path: "scripts/smoke.mjs", url: URL_ }]);
    // The generated deploy config is removed once deployed; the Operator's own file stays.
    expect([...w.files.keys()]).toEqual([operatorFile()]);
    const last = w.said.join("\n");
    expect(last).toContain(URL_);
    expect(last).toContain(`${URL_}/oauth/callback`);
    expect(last).toContain("npm run setup -- signin");
  });

  it("setup_stops_at_first_failure_and_says_what_to_do", async () => {
    const out = world(TRIAL);
    out.state.loggedIn = false;
    expect(await stopped(setup("setup", out.deps))).toMatch(/npx wrangler login/);
    expect(out.requests).toEqual([]);

    const noSub = world(TRIAL);
    noSub.state.subdomain = null;
    expect(await stopped(setup("setup", noSub.deps))).toMatch(/workers\.dev subdomain/);
    expect(noSub.state.hyperdrives.size).toBe(0);

    const refused = world(TRIAL);
    refused.state.hyperdriveRefuses = true;
    const msg = await stopped(setup("setup", refused.deps));
    expect(msg).toMatch(/Hyperdrive/);
    expect(msg).toMatch(/Failed to connect to the origin/);
    expect(refused.deployed).toEqual([]);

    const deployFails = world(TRIAL);
    deployFails.state.failOn = (a) => a[0] === "deploy";
    expect(await stopped(setup("setup", deployFails.deps))).toMatch(/deploy/i);
    expect(deployFails.scripts).toEqual([]);
  });

  it("setup_refuses_postgres_account_at_the_question", async () => {
    for (const role of ["postgres", "Postgres"]) {
      const w = world({ ...TRIAL, role });
      expect(await stopped(setup("setup", w.deps))).toMatch(/postgres/);
      expect(w.calls).toEqual([]);
      expect(w.requests).toEqual([]);
    }
    const dotted = world({ ...TRIAL, role: "postgres.abcdefghijklmnopqrst" });
    expect(await stopped(setup("setup", dotted.deps))).toMatch(/postgres/);
    expect(dotted.calls).toEqual([]);
  });

  it("setup_asks_which_cloudflare_account", async () => {
    const w = world({ ...TRIAL, account: "Prinsloo" });
    w.state.accounts = [{ id: "acc-0", name: "Someone else" }, { id: ACCOUNT, name: "Prinsloo" }];
    await setup("setup", w.deps);
    expect(w.asked.find((p) => p.key === "account")?.choices).toEqual(["Someone else", "Prinsloo"]);
    expect(operator(w).account_id).toBe(ACCOUNT);
    expect(w.deployed[0]!.config.account_id).toBe(ACCOUNT);
    for (const c of w.calls.filter((c) => c.args[0] !== "whoami")) expect(c.accountId).toBe(ACCOUNT);
    for (const r of w.requests) expect(r.url).toContain(`/accounts/${ACCOUNT}/`);

    const one = world(TRIAL);
    await setup("setup", one.deps);
    expect(one.asked.map((p) => p.key)).not.toContain("account");
  });

  it("setup_refuses_worker_it_did_not_make", async () => {
    const w = world(TRIAL);
    w.state.workers.set(TRIAL.worker, { secrets: new Set(["SERVER_SECRET"]), vars: { ROW_LIMIT: "500" } });
    expect(await stopped(setup("setup", w.deps))).toMatch(/already exists/);
    expect(w.state.hyperdrives.size).toBe(0);
    expect(w.deployed).toEqual([]);
    expect(w.calls.filter((c) => c.args[0] === "secret" && c.args[1] === "put")).toEqual([]);
  });

  it("setup_adopts_its_own_worker_after_confirmation", async () => {
    const make = () => {
      const w = world({ ...TRIAL, adopt: TRIAL.worker });
      w.state.hyperdrives.set("hd-9", { id: "hd-9", name: TRIAL.worker, origin: { host: TRIAL.host, user: `${TRIAL.role}.${TRIAL.projectRef}` }, caching: { disabled: true } });
      w.state.workers.set(TRIAL.worker, { secrets: new Set(["SERVER_SECRET"]), vars: { ENGINE: "postgres", ROW_LIMIT: "500" }, hyperdriveId: "hd-9" });
      return w;
    };
    const w = make();
    await setup("setup", w.deps);
    expect(w.asked.some((p) => p.key === "adopt")).toBe(true);
    expect(operator(w).hyperdrive_id).toBe("hd-9");
    expect(operator(w).database_account).toBe(TRIAL.role);
    expect(w.state.hyperdrives.size).toBe(1);

    const wrongName = world({ ...TRIAL, adopt: "something-else" });
    wrongName.state.hyperdrives.set("hd-9", { id: "hd-9", name: TRIAL.worker, origin: {}, caching: { disabled: true } });
    wrongName.state.workers.set(TRIAL.worker, { secrets: new Set(), vars: {}, hyperdriveId: "hd-9" });
    expect(await stopped(setup("setup", wrongName.deps))).toMatch(/not adopted/);
    expect(wrongName.deployed).toEqual([]);
  });

  it("setup_smoke_retries_then_fails", async () => {
    const recovers = world(TRIAL);
    recovers.state.smokeFailures = 3;
    await setup("setup", recovers.deps);
    expect(recovers.scripts).toHaveLength(4);
    expect(recovers.slept()).toBeLessThanOrEqual(120_000);

    const never = world(TRIAL);
    never.state.smokeFailures = 1_000;
    const msg = await stopped(setup("setup", never.deps));
    expect(msg).toMatch(/smoke/i);
    expect(msg).toContain("healthz");
    expect(never.slept()).toBeGreaterThanOrEqual(110_000);
    expect(never.slept()).toBeLessThanOrEqual(120_000);
  });
});

describe("rerunning the setup command", () => {
  it("setup_rerun_resumes_without_duplicates", async () => {
    const w = world(TRIAL);
    w.state.failOn = (a) => a[0] === "deploy";
    await stopped(setup("setup", w.deps));
    w.state.failOn = null;
    await setup("setup", w.deps);
    expect(w.state.hyperdrives.size).toBe(1);
    expect(w.requests.filter((r) => r.method === "POST")).toHaveLength(1);
    expect(w.deployed).toHaveLength(1);
    // The Hyperdrive config existed, so the Database account's SQL is not printed a second time.
    expect(w.paused.filter((p) => p.includes("ROLE"))).toHaveLength(1);

    // Stopped at the SQL prompt, before the SQL was run: the rerun prints it again and carries on.
    const atPrompt = world(TRIAL);
    atPrompt.state.abandonPauses = 1;
    expect(await stopped(setup("setup", atPrompt.deps))).toMatch(/interrupted/);
    expect(atPrompt.state.hyperdrives.size).toBe(0);
    await setup("setup", atPrompt.deps);
    expect(atPrompt.paused[1]).toContain(`CREATE ROLE "${TRIAL.role}"`);
    expect(atPrompt.state.hyperdrives.size).toBe(1);
    expect(atPrompt.deployed).toHaveLength(1);

    // Stopped at SERVER_SECRET, then at the smoke checks: each rerun creates nothing twice.
    const later = world(TRIAL);
    later.state.failOn = (a) => a[0] === "secret";
    await stopped(setup("setup", later.deps));
    later.state.failOn = null;
    later.state.smokeFailures = 1_000;
    await stopped(setup("setup", later.deps));
    later.state.smokeFailures = 0;
    await setup("setup", later.deps);
    expect(later.state.hyperdrives.size).toBe(1);
    expect(later.requests.filter((r) => r.method === "POST")).toHaveLength(1);
    expect(later.calls.filter((c) => c.args[0] === "secret" && c.args[1] === "put" && c.args[2] === "SERVER_SECRET")).toHaveLength(2);
    expect(later.deployed).toHaveLength(2);

    // Stopped after Hyperdrive was created but before its id was written: the rerun takes that config
    // as its own, asks nothing about reusing it, and gives it the new password its SQL sets.
    const gap = world(TRIAL);
    gap.files.set(operatorFile(), JSON.stringify({ name: TRIAL.worker, account_id: ACCOUNT, database_account: TRIAL.role, vars: { ROW_LIMIT: "500" } }));
    gap.state.hyperdrives.set("hd-5", { id: "hd-5", name: TRIAL.worker, origin: {}, caching: { disabled: true } });
    await setup("setup", gap.deps);
    expect(gap.asked.map((p) => p.key)).not.toContain("reuseHyperdrive");
    expect(JSON.parse(gap.requests.find((r) => r.method === "PATCH")!.body!).origin.password).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(operator(gap).hyperdrive_id).toBe("hd-5");
    expect(gap.state.hyperdrives.size).toBe(1);
  });

  it("setup_reads_server_secret_from_worker_settings", async () => {
    const w = world(TRIAL);
    await setup("setup", w.deps);
    // The Worker's own settings decide, and they list SERVER_SECRET.
    await setup("setup", w.deps);
    const puts = w.calls.filter((c) => c.args[0] === "secret" && c.args[1] === "put" && c.args[2] === "SERVER_SECRET");
    expect(puts).toHaveLength(1);
    expect(w.calls.some((c) => c.args[0] === "secret" && c.args[1] === "list")).toBe(false);
    // A failure reading those settings stops setup; it is never read as "no secret".
    w.state.apiFails = { path: `/workers/scripts/${TRIAL.worker}/settings`, status: 500 };
    expect(await stopped(setup("setup", w.deps))).toMatch(/Cloudflare refused/);
    expect(w.calls.filter((c) => c.args[0] === "secret" && c.args[1] === "put")).toHaveLength(1);
    // So does a 404 that is not Cloudflare's "no such Worker": only that code means the Worker is absent.
    w.state.apiFails = { path: `/workers/scripts/${TRIAL.worker}/settings`, status: 404 };
    expect(await stopped(setup("setup", w.deps))).toMatch(/Cloudflare refused/);
    expect(w.calls.filter((c) => c.args[0] === "secret" && c.args[1] === "put")).toHaveLength(1);
  });

  it("setup_reuses_hyperdrive_with_new_password", async () => {
    // A same-named Hyperdrive config that no file here names, and the Operator chooses to reuse it.
    const w = world({ ...TRIAL, reuseHyperdrive: "yes" });
    w.state.hyperdrives.set("hd-7", { id: "hd-7", name: TRIAL.worker, origin: { host: "old.example.com", password: "old" }, caching: { disabled: false } });
    await setup("setup", w.deps);
    expect(w.asked.some((p) => p.key === "reuseHyperdrive")).toBe(true);
    const patch = w.requests.find((r) => r.method === "PATCH")!;
    const sent = JSON.parse(patch.body!) as { origin: { password?: string; host: string }; caching: unknown };
    expect(sent.origin.host).toBe(TRIAL.host);
    expect(sent.origin.password).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.state.hyperdrives.get("hd-7")!.origin.password).toBe(sent.origin.password);
    expect(sent.caching).toEqual({ disabled: true });
    expect(w.paused[0]).toContain(`CREATE ROLE "${TRIAL.role}"`);
    expect(w.requests.filter((r) => r.method === "POST")).toHaveLength(0);
    expect(operator(w).hyperdrive_id).toBe("hd-7");

    const declined = world({ ...TRIAL, reuseHyperdrive: "no" });
    declined.state.hyperdrives.set("hd-7", { id: "hd-7", name: TRIAL.worker, origin: {}, caching: {} });
    expect(await stopped(setup("setup", declined.deps))).toMatch(/Nothing was changed/);
    expect(declined.paused).toEqual([]);
  });

  it("setup_reports_cloudflare_errors_and_unreadable_output", async () => {
    // An API error outside any step's own handling still stops with what to do.
    const forbidden = world(TRIAL);
    forbidden.state.apiFails = { path: "/workers/subdomain", status: 403 };
    expect(await stopped(setup("setup", forbidden.deps))).toMatch(/Cloudflare refused a request: HTTP 403.*npx wrangler login/s);

    // A success with no readable body is an error at the call, before any SQL is shown.
    const empty = world(TRIAL);
    empty.state.apiFails = { path: "/hyperdrive/configs", status: 200 };
    expect(await stopped(setup("setup", empty.deps))).toMatch(/answered with no result/);
    expect(empty.paused).toEqual([]);

    // Wrangler output setup cannot read is named, never echoed: it may hold a token.
    const garbled = world(TRIAL);
    garbled.state.tokenOutput = `token=${OAUTH_TOKEN} (not JSON)`;
    const msg = await stopped(setup("setup", garbled.deps));
    expect(msg).toMatch(/wrangler auth token gave output setup cannot read/);
    expect(msg).not.toContain(OAUTH_TOKEN);

    // A hand-edited Boundary the Server would refuse.
    const badBoundary = world(TRIAL);
    await setup("setup", badBoundary.deps);
    const file = operator(badBoundary);
    file.vars.BOUNDARY = '{"schemas": "sales"}';
    badBoundary.files.set(operatorFile(), JSON.stringify(file));
    expect(await stopped(setup("setup", badBoundary.deps))).toMatch(/BOUNDARY in wrangler\.sql-mcp-trial\.jsonc is not a valid Boundary/);
  });

  it("setup_forms_ask_worker_only_with_choice", async () => {
    const w = world(TRIAL);
    await setup("setup", w.deps);
    await setup("deploy", w.deps);
    expect(w.asked.filter((p) => p.key === "worker")).toHaveLength(1);
    // With two Deployments here, the other forms ask which.
    w.files.set(operatorFile("other"), w.files.get(operatorFile())!.replace(TRIAL.worker, "other"));
    await setup("deploy", w.deps);
    expect(w.asked.filter((p) => p.key === "worker").at(-1)!.choices).toEqual([TRIAL.worker, "other"]);
  });

  it("setup_rerun_keeps_server_secret", async () => {
    const w = world(TRIAL);
    await setup("setup", w.deps);
    await setup("setup", w.deps);
    const puts = w.calls.filter((c) => c.args[0] === "secret" && c.args[1] === "put" && c.args[2] === "SERVER_SECRET");
    expect(puts).toHaveLength(1);
  });

  it("setup_rerun_resets_password_of_orphaned_role", async () => {
    // The Operator ran the CREATE ROLE SQL, then the Hyperdrive config was refused (a wrong pooler host).
    const w = world(TRIAL);
    w.state.hyperdriveRefuses = true;
    await stopped(setup("setup", w.deps));
    expect(w.paused[0]).toContain("CREATE ROLE");
    w.state.hyperdriveRefuses = false;
    await setup("setup", w.deps);
    // The rerun prints the account SQL again with a new password's verifier. That SQL resets the
    // role only because setup marked it for this Deployment (database-account.int.test.ts).
    expect(w.paused[1]).toContain(`IS '${roleMark(TRIAL.worker, ACCOUNT)}'`);
    const first = w.paused[0]!.match(/PASSWORD '([^']+)'/)![1]!;
    const second = w.paused[1]!.match(/PASSWORD '([^']+)'/)![1]!;
    expect(second).toMatch(/^SCRAM-SHA-256\$4096:/);
    expect(second).not.toBe(first);
    const created = JSON.parse(w.requests.filter((r) => r.method === "POST").at(-1)!.body!);
    expect(created.origin.password).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.paused[1]).not.toContain(created.origin.password);
  });

  it("setup_rerun_keeps_unasked_fields", async () => {
    const w = world(TRIAL);
    await setup("setup", w.deps);
    // The Operator excluded a table by hand, and set up Sign-in.
    const file = operator(w);
    file.vars.BOUNDARY = '{"schemas":["sales"],"exclude":[["sales","payroll"]]}';
    file.vars.IDP_ISSUER = "https://login.microsoftonline.com/t/v2.0";
    file.vars.IDP_CLIENT_ID = "client-1";
    w.files.set(operatorFile(), JSON.stringify(file));
    const again = world({ ...TRIAL, schemas: "sales, finance", rowLimit: "250" });
    Object.assign(again.state, w.state);
    again.files.set(operatorFile(), w.files.get(operatorFile())!);
    await setup("setup", again.deps);
    expect(operator(again).vars).toEqual({
      ROW_LIMIT: "250",
      BOUNDARY: '{"schemas":["sales","finance"],"exclude":[["sales","payroll"]]}',
      IDP_ISSUER: "https://login.microsoftonline.com/t/v2.0",
      IDP_CLIENT_ID: "client-1",
    });
  });

  it("setup_adoption_restores_worker_vars", async () => {
    const w = world({ ...TRIAL, adopt: TRIAL.worker });
    const vars = {
      ENGINE: "postgres",
      ROW_LIMIT: "100",
      BOUNDARY: '{"schemas":["sales"],"exclude":[["sales","payroll"]]}',
      IDP_ISSUER: "https://login.microsoftonline.com/t/v2.0",
      IDP_CLIENT_ID: "client-1",
    };
    w.state.hyperdrives.set("hd-9", { id: "hd-9", name: TRIAL.worker, origin: { user: "sqlmcp_adopted.abcdefghijklmnopqrst" }, caching: { disabled: true } });
    w.state.workers.set(TRIAL.worker, { secrets: new Set(["SERVER_SECRET", "IDP_CLIENT_SECRET"]), vars, hyperdriveId: "hd-9" });
    await setup("setup", w.deps);
    // Every setting comes back from Cloudflare as it is, and none is asked: no default can replace one.
    expect(operator(w).vars).toEqual({
      ROW_LIMIT: "100",
      BOUNDARY: '{"schemas":["sales"],"exclude":[["sales","payroll"]]}',
      IDP_ISSUER: "https://login.microsoftonline.com/t/v2.0",
      IDP_CLIENT_ID: "client-1",
    });
    expect(w.asked.map((p) => p.key)).toEqual(["worker", "adopt"]);
    // The Database account is read from the Hyperdrive config's pooler user, `<role>.<project ref>`.
    expect(operator(w).database_account).toBe("sqlmcp_adopted");
    expect(w.deployed[0]!.config.vars).toMatchObject({ ROW_LIMIT: "100", IDP_ISSUER: vars.IDP_ISSUER, IDP_CLIENT_ID: "client-1" });
    expect(w.paused).toEqual([]);
    expect(w.requests.filter((r) => r.method !== "GET")).toEqual([]);

    // A Hyperdrive config connecting as postgres was not made by setup, and is not adopted.
    const asPostgres = world({ worker: TRIAL.worker, adopt: TRIAL.worker });
    asPostgres.state.hyperdrives.set("hd-9", { id: "hd-9", name: TRIAL.worker, origin: { user: "postgres.abcdefghijklmnopqrst" }, caching: {} });
    asPostgres.state.workers.set(TRIAL.worker, { secrets: new Set(["SERVER_SECRET"]), vars, hyperdriveId: "hd-9" });
    expect(await stopped(setup("setup", asPostgres.deps))).toMatch(/nothing was adopted/);
    expect(asPostgres.files.size).toBe(0);
  });

  it("setup_rerun_with_new_role_prints_its_sql", async () => {
    const w = world(TRIAL);
    await setup("setup", w.deps);
    const again = world({ ...TRIAL, role: "sqlmcp_trial_two" });
    Object.assign(again.state, w.state);
    again.files.set(operatorFile(), w.files.get(operatorFile())!);
    await setup("setup", again.deps);
    // The new role's SQL is printed, and Hyperdrive moves to it with its own new password.
    expect(again.paused[0]).toContain(`CREATE ROLE "sqlmcp_trial_two"`);
    const patch = JSON.parse(again.requests.find((r) => r.method === "PATCH")!.body!) as { origin: { user: string; password?: string } };
    expect(patch.origin.user).toBe(`sqlmcp_trial_two.${TRIAL.projectRef}`);
    expect(patch.origin.password).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(operator(again).database_account).toBe("sqlmcp_trial_two");
  });
});

describe("the setup command's secrets", () => {
  it("setup_passes_secrets_on_stdin", async () => {
    const w = world({ ...TRIAL, tenant: "tenant-1", clientId: "client-1", clientSecret: "client-secret-value" });
    await setup("setup", w.deps);
    await setup("signin", w.deps);
    const puts = w.calls.filter((c) => c.args[0] === "secret" && c.args[1] === "put");
    expect(puts.map((c) => c.args[2])).toEqual(["SERVER_SECRET", "IDP_CLIENT_SECRET"]);
    expect(puts[0]!.stdin).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(puts[1]!.stdin).toBe("client-secret-value");
    for (const s of w.secrets()) for (const c of w.calls) expect(c.args.join(" ")).not.toContain(s);
  });

  it("setup_sends_database_password_only_in_api_body", async () => {
    const w = world(TRIAL);
    await setup("setup", w.deps);
    const post = w.requests.find((r) => r.method === "POST")!;
    const password = (JSON.parse(post.body!) as { origin: { password: string } }).origin.password;
    expect(password).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(post.url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/hyperdrive/configs`);
    expect(post.headers.authorization).toBe(`Bearer ${OAUTH_TOKEN}`);
    for (const r of w.requests) {
      expect(r.url).not.toContain(password);
      expect(JSON.stringify(r.headers)).not.toContain(password);
    }
    for (const c of w.calls) expect(c.args.join(" ") + (c.stdin ?? "")).not.toContain(password);
  });

  it("setup_prints_only_the_password_verifier", async () => {
    const w = world(TRIAL);
    await setup("setup", w.deps);
    const sql = w.paused[0]!;
    const verifier = sql.match(/PASSWORD '([^']+)'/)![1]!;
    expect(verifier).toMatch(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    for (const s of w.secrets()) expect(sql).not.toContain(s);
  });

  it("setup_writes_no_secret_to_config_or_output", async () => {
    const w = world({ ...TRIAL, tenant: "tenant-1", clientId: "client-1", clientSecret: "client-secret-value" });
    await setup("setup", w.deps);
    await setup("signin", w.deps);
    await setup("password", w.deps);
    const seen = [...w.files.values(), ...w.deployed.map((d) => JSON.stringify(d.config)), ...w.said, ...w.paused, ...w.asked.map((p) => p.text)];
    expect(w.secrets().length).toBeGreaterThanOrEqual(5);
    for (const s of w.secrets()) for (const text of seen) expect(text).not.toContain(s);
    expect(w.asked.find((p) => p.key === "clientSecret")?.hidden).toBe(true);
  });

  it("setup_runs_wrangler_without_shell", async () => {
    const spawned: { command: string; args: string[]; options: Record<string, unknown>; stdin: string }[] = [];
    const run = wranglerRunner("/pkg", (command, args, options) => {
      const call = { command, args, options: options as Record<string, unknown>, stdin: "" };
      spawned.push(call);
      return fakeChild((s) => (call.stdin += s));
    });
    await run(["secret", "put", "SERVER_SECRET", "--name", "w"], { accountId: "acc-1", stdin: "s3cret" });
    const [c] = spawned;
    expect(c!.command).toBe(process.execPath);
    expect(c!.args[0]).toBe(join("/pkg", "node_modules", "wrangler", "bin", "wrangler.js"));
    expect(c!.args.slice(1)).toEqual(["secret", "put", "SERVER_SECRET", "--name", "w"]);
    expect(c!.options.shell).toBeFalsy();
    expect((c!.options.env as Record<string, string>).CLOUDFLARE_ACCOUNT_ID).toBe("acc-1");
    expect(c!.stdin).toBe("s3cret");
  });
});

describe("Sign-in, password rotation and removal", () => {
  it("setup_signin_sets_idp_and_redeploys", async () => {
    const w = world({ ...TRIAL, tenant: "11111111-2222-3333-4444-555555555555", clientId: "client-1", clientSecret: "client-secret-value" });
    await setup("setup", w.deps);
    await setup("signin", w.deps);
    expect(operator(w).vars).toMatchObject({
      IDP_ISSUER: "https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0",
      IDP_CLIENT_ID: "client-1",
    });
    expect(w.deployed).toHaveLength(2);
    expect(w.deployed[1]!.config.vars).toMatchObject({ IDP_CLIENT_ID: "client-1", BOUNDARY: '{"schemas":["sales"]}' });
    expect(w.scripts.at(-1)).toEqual({ path: "scripts/smoke-signin.mjs", url: URL_ });
    // A full issuer URL is taken as given.
    const v = world({ ...TRIAL, tenant: "https://accounts.example.com", clientId: "c", clientSecret: "client-secret-value" });
    await setup("setup", v.deps);
    await setup("signin", v.deps);
    expect(operator(v).vars.IDP_ISSUER).toBe("https://accounts.example.com");
  });

  it("setup_password_updates_role_and_hyperdrive", async () => {
    const w = world(TRIAL);
    await setup("setup", w.deps);
    const first = JSON.parse(w.requests.find((r) => r.method === "POST")!.body!).origin.password as string;
    await setup("password", w.deps);
    // The same SQL, for the role setup marked; its listing now shows what was granted, not nothing.
    const rotation = w.paused.at(-1)!;
    expect(rotation).toContain(`IS '${roleMark(TRIAL.worker, ACCOUNT)}'`);
    expect(rotation).toContain("the tables and columns granted to it");
    expect(rotation).not.toMatch(/expect no rows/i);
    expect(rotation.match(/PASSWORD '([^']+)'/)![1]).not.toBe(w.paused[0]!.match(/PASSWORD '([^']+)'/)![1]);
    const patch = w.requests.find((r) => r.method === "PATCH")!;
    expect(patch.url).toContain("/hyperdrive/configs/hd-1");
    const second = JSON.parse(patch.body!).origin.password as string;
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(w.scripts.at(-1)).toEqual({ path: "scripts/smoke.mjs", url: URL_ });
  });

  it("setup_remove_deletes_only_what_config_names", async () => {
    const w = world({ ...TRIAL, confirmRemove: TRIAL.worker });
    w.state.workers.set("sql-mcp-server", { secrets: new Set(["SERVER_SECRET"]), vars: {}, hyperdriveId: "hd-project" });
    w.state.hyperdrives.set("hd-project", { id: "hd-project", name: "sql-mcp-server", origin: {}, caching: {} });
    await setup("setup", w.deps);
    await setup("remove", w.deps);
    expect(w.state.workers.has(TRIAL.worker)).toBe(false);
    expect(w.state.hyperdrives.has("hd-1")).toBe(false);
    expect(w.files.has(operatorFile())).toBe(false);
    // The project's own Deployment is untouched.
    expect(w.state.workers.has("sql-mcp-server")).toBe(true);
    expect(w.state.hyperdrives.has("hd-project")).toBe(true);
    expect(w.said.join("\n")).toContain(`DROP ROLE "${TRIAL.role}"`);
    expect(w.said.join("\n")).toContain(`IS DISTINCT FROM '${roleMark(TRIAL.worker, ACCOUNT)}'`);

    const unconfirmed = world({ ...TRIAL, confirmRemove: "no" });
    await setup("setup", unconfirmed.deps);
    expect(await stopped(setup("remove", unconfirmed.deps))).toMatch(/Nothing was removed/);
    expect(unconfirmed.state.workers.has(TRIAL.worker)).toBe(true);
  });
});

/** A child process that takes stdin and exits 0. */
function fakeChild(onStdin: (s: string) => void) {
  const listeners = new Map<string, (...a: unknown[]) => void>();
  const child = {
    stdin: { write: (s: string) => onStdin(s), end: () => setTimeout(() => listeners.get("close")?.(0), 0) },
    stdout: { on: () => {} },
    stderr: { on: () => {} },
    on: (event: string, f: (...a: unknown[]) => void) => {
      listeners.set(event, f);
      return child;
    },
  };
  return child as never;
}
