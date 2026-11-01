import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseJsonc } from "../../deploy/cloudflare/lib/config.js";
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

describe("S-005 the setup command", () => {
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
    // The Hyperdrive config, named after the Worker, with caching disabled (D-079).
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
    // No Boundary answer means no Boundary (D-075).
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
    const dotted = world({ ...TRIAL, role: "postgres.dwsikgvekndbmowzdcnx" });
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
      w.state.hyperdrives.set("hd-9", { id: "hd-9", name: TRIAL.worker, origin: { host: TRIAL.host }, caching: { disabled: true } });
      w.state.workers.set(TRIAL.worker, { secrets: new Set(["SERVER_SECRET"]), vars: { ENGINE: "postgres", ROW_LIMIT: "500" }, hyperdriveId: "hd-9" });
      return w;
    };
    const w = make();
    await setup("setup", w.deps);
    expect(w.asked.some((p) => p.key === "adopt")).toBe(true);
    expect(operator(w).hyperdrive_id).toBe("hd-9");
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

describe("S-005 rerunning the setup command", () => {
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
    expect(w.paused[1]).toContain(`ALTER ROLE "${TRIAL.role}"`);
    expect(w.paused[1]).not.toContain("CREATE ROLE");
    const created = JSON.parse(w.requests.find((r) => r.method === "POST" && r.body?.includes("origin"))!.body!);
    const verifier = w.paused[1]!.match(/PASSWORD '([^']+)'/)![1]!;
    expect(verifier).toMatch(/^SCRAM-SHA-256\$4096:/);
    expect(created.origin.password).not.toBe(verifier);
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
    w.state.hyperdrives.set("hd-9", { id: "hd-9", name: TRIAL.worker, origin: {}, caching: { disabled: true } });
    w.state.workers.set(TRIAL.worker, { secrets: new Set(["SERVER_SECRET", "IDP_CLIENT_SECRET"]), vars, hyperdriveId: "hd-9" });
    await setup("setup", w.deps);
    // The answered fields change (Row limit 500, Boundary schemas); the rest come back from Cloudflare.
    expect(operator(w).vars).toEqual({
      ROW_LIMIT: "500",
      BOUNDARY: '{"schemas":["sales"],"exclude":[["sales","payroll"]]}',
      IDP_ISSUER: "https://login.microsoftonline.com/t/v2.0",
      IDP_CLIENT_ID: "client-1",
    });
    expect(w.deployed[0]!.config.vars).toMatchObject({ IDP_ISSUER: vars.IDP_ISSUER, IDP_CLIENT_ID: "client-1" });
  });
});

describe("S-005 the setup command's secrets", () => {
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

describe("S-005 Sign-in, password rotation and removal", () => {
  it("setup_signin_sets_idp_and_redeploys", async () => {
    const w = world({ ...TRIAL, tenant: "9416b60e-03b2-44ee-84ff-5d25e16cf730", clientId: "client-1", clientSecret: "client-secret-value" });
    await setup("setup", w.deps);
    await setup("signin", w.deps);
    expect(operator(w).vars).toMatchObject({
      IDP_ISSUER: "https://login.microsoftonline.com/9416b60e-03b2-44ee-84ff-5d25e16cf730/v2.0",
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
    expect(w.paused.at(-1)).toContain(`ALTER ROLE "${TRIAL.role}" PASSWORD 'SCRAM-SHA-256$4096:`);
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
