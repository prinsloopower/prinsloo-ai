import { type Cloudflare, CloudflareError, type Credentials, type HyperdriveOrigin, cloudflare } from "./cloudflare.js";
import { type OperatorConfig, deployPath, mergeConfig, operatorPath, operatorText, operatorWorkers, parseJsonc, template } from "./config.js";
import { alterRoleSql, createRoleSql, dropRoleSql, scramVerifier } from "./database-account.js";

/** The setup command's forms (S-005). */
export type Form = "setup" | "deploy" | "signin" | "password" | "remove";

export type Prompt = { key: string; text: string; default?: string; hidden?: boolean; choices?: string[] };
export type RunResult = { code: number; stdout: string; stderr: string };

export interface Files {
  read(path: string): string | undefined;
  write(path: string, text: string): void;
  remove(path: string): void;
  list(): string[];
}

/** Everything the setup command touches outside itself, so tests can stand in for each. */
export interface SetupDeps {
  ask(prompt: Prompt): Promise<string>;
  pause(text: string): Promise<void>;
  say(text: string): void;
  wrangler(args: string[], opts?: { accountId?: string; stdin?: string }): Promise<RunResult>;
  fetch: typeof fetch;
  script(path: "scripts/smoke.mjs" | "scripts/smoke-signin.mjs", url: string): Promise<RunResult>;
  files: Files;
  randomBytes(n: number): Uint8Array;
  sleep(ms: number): Promise<void>;
}

/** A step failed; the message says what failed and what to do. */
export class SetupStopped extends Error {}

const SMOKE_FOR_MS = 120_000;
const SMOKE_EVERY_MS = 10_000;
const WORKER_NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

export async function setup(form: Form, deps: SetupDeps): Promise<void> {
  if (form === "setup") return firstSetup(deps);
  const session = await openDeployment(deps);
  if (form === "deploy") return deployAndCheck(deps, session, "scripts/smoke.mjs");
  if (form === "signin") return signin(deps, session);
  if (form === "password") return rotatePassword(deps, session);
  return remove(deps, session);
}

/** `npm run setup`: from answers to a deployed, checked Deployment, resuming whatever an earlier run left. */
async function firstSetup(deps: SetupDeps) {
  const worker = await askValid(deps, { key: "worker", text: "Worker name (lowercase letters, digits and dashes; also the workers.dev hostname)" }, (v) =>
    WORKER_NAME.test(v) ? undefined : "Use lowercase letters, digits and dashes, starting and ending with a letter or digit.",
  );
  const existing = readOperator(deps, worker);
  const host = await askValid(deps, { key: "host", text: "Supabase session pooler host (Connect → Session pooler, e.g. aws-0-us-east-2.pooler.supabase.com)" }, (v) =>
    /^[a-z0-9.-]+$/i.test(v) ? undefined : "Give the host name alone, with no scheme, port or path.",
  );
  const port = await askValid(deps, { key: "port", text: "Its port", default: "5432" }, (v) => (/^\d{1,5}$/.test(v) ? undefined : "Give a port number."));
  const database = await askValid(deps, { key: "database", text: "Database name", default: "postgres" }, nonEmpty);
  const projectRef = await askValid(deps, { key: "projectRef", text: "Supabase project ref (the id in your project's URL)" }, (v) =>
    /^[a-z0-9]+$/.test(v) ? undefined : "Give the project ref alone: lowercase letters and digits.",
  );
  const role = await askValid(deps, { key: "role", text: "Database account (a new role, dedicated to this Deployment)", default: existing?.database_account ?? "sqlmcp_reader" }, (v) => {
    if (/^postgres(\.|$)/i.test(v)) throw new SetupStopped("Supabase's postgres role bypasses grants, so the Server refuses it (D-077). Choose a new role name, such as sqlmcp_reader, and rerun npm run setup.");
    return ROLE_NAME.test(v) ? undefined : "Use lowercase letters, digits and underscores, starting with a letter.";
  });
  const boundary = existing?.vars.BOUNDARY ? (JSON.parse(existing.vars.BOUNDARY) as { schemas?: string[]; exclude?: string[][] }) : {};
  const schemasText = await deps.ask({
    key: "schemas",
    text: "Schemas in the Boundary, comma-separated (blank for none: the grants alone decide). Name your own schemas if the Database account's listing showed anything",
    default: boundary.schemas?.join(", ") ?? "",
  });
  const schemas = schemasText.split(",").map((s) => s.trim()).filter(Boolean);
  const rowLimit = await askValid(deps, { key: "rowLimit", text: "Row limit (1–10,000)", default: existing?.vars.ROW_LIMIT ?? "500" }, (v) =>
    /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 10_000 ? undefined : "Give a whole number from 1 to 10,000.",
  );

  // 1. The Cloudflare sign-in, the account, and its workers.dev subdomain.
  const { accountId, api } = await signedIn(deps, existing?.account_id);
  const subdomain = await requireSubdomain(api);

  // 2. Never take over a Worker this setup did not make.
  let config: OperatorConfig = existing ?? { name: worker, account_id: accountId, database_account: role, vars: {} };
  const bindings = await api.workerBindings(worker);
  const hyperdrives = await api.hyperdrives();
  let hyperdrive = hyperdrives.find((h) => h.name === worker);
  if (bindings && !existing) {
    if (!hyperdrive) {
      throw new SetupStopped(`A Worker named ${worker} already exists in this account, and this setup did not make it. Deploying would replace it. Choose another Worker name and rerun npm run setup.`);
    }
    const typed = await deps.ask({ key: "adopt", text: `A Worker named ${worker} and its Hyperdrive config already exist, made by an earlier setup whose config file is not here. Type the Worker's name to adopt it` });
    if (typed !== worker) throw new SetupStopped(`The Worker was not adopted, and nothing was changed.`);
    const vars = Object.fromEntries(bindings.filter((b) => b.type === "plain_text" && b.name !== "ENGINE").map((b) => [b.name, b.text ?? ""]));
    const id = bindings.find((b) => b.type === "hyperdrive")?.id ?? hyperdrive.id;
    config = { name: worker, account_id: accountId, hyperdrive_id: id, database_account: role, vars };
    hyperdrive = hyperdrives.find((h) => h.id === id) ?? hyperdrive;
  }
  const kept = config.vars.BOUNDARY ? (JSON.parse(config.vars.BOUNDARY) as { exclude?: string[][] }) : {};
  const vars: Record<string, string> = { ...config.vars, ROW_LIMIT: rowLimit };
  if (schemas.length > 0 || kept.exclude) vars.BOUNDARY = JSON.stringify({ ...(schemas.length > 0 ? { schemas } : {}), ...(kept.exclude ? { exclude: kept.exclude } : {}) });
  else delete vars.BOUNDARY;
  config = { ...config, account_id: accountId, database_account: role, vars };

  // 3. The Database account: new, or a new password for one an earlier run made but Hyperdrive never got.
  const origin: HyperdriveOrigin = { scheme: "postgres", host, port: Number(port), database, user: `${role}.${projectRef}` };
  let password: string | undefined;
  const ours = hyperdrive !== undefined && hyperdrive.id === config.hyperdrive_id;
  if (!hyperdrive || !ours) {
    if (hyperdrive && !ours) {
      const reuse = await deps.ask({ key: "reuseHyperdrive", text: `A Hyperdrive config named ${worker} already exists. Reuse it with these connection details? (yes/no)`, default: "no" });
      if (reuse !== "yes") throw new SetupStopped(`Nothing was changed. Choose another Worker name, or delete the Hyperdrive config ${worker} in the dashboard, and rerun npm run setup.`);
    }
    const fresh = generatePassword(deps);
    password = fresh;
    const verifier = scramVerifier(fresh, deps.randomBytes(16));
    const orphaned = existing !== undefined && !existing.hyperdrive_id && existing.database_account === role;
    const sql = orphaned || hyperdrive ? alterRoleSql(role, verifier) : createRoleSql(role, verifier);
    writeOperator(deps, config);
    await deps.pause(
      `Run this SQL as postgres in the Supabase SQL editor, then press Enter here. ${orphaned ? "An earlier run made this role; this gives it a new password." : "Its listing should show no rows (guide section 2)."}\n\n${sql}`,
    );
  }

  // 4. Hyperdrive, with caching disabled (D-079). The password goes only in the API request (D-103).
  try {
    hyperdrive = hyperdrive
      ? await api.updateHyperdrive(hyperdrive.id, password ? origin : withoutPassword(origin))
      : // With no Hyperdrive config, step 3 always made a password.
        await api.createHyperdrive(worker, { ...origin, password: password! });
  } catch (e) {
    throw new SetupStopped(`Cloudflare did not ${hyperdrive ? "update" : "create"} the Hyperdrive config: ${message(e)}. Check the pooler host, port, project ref and database name, then rerun npm run setup.`);
  }

  // 5. The Operator's own file.
  config = { ...config, hyperdrive_id: hyperdrive.id };
  writeOperator(deps, config);

  // 6. SERVER_SECRET, kept if the Worker already has one, so a rerun voids no Sign-in.
  const session: Session = { worker, config, accountId, api, subdomain };
  const hasSecret = bindings !== undefined && (await secretNames(deps, session)).includes("SERVER_SECRET");
  if (!hasSecret) await putSecret(deps, session, "SERVER_SECRET", generatePassword(deps));

  // 7–9. Deploy, check, and say what comes next.
  await deployAndCheck(deps, session, "scripts/smoke.mjs");
  const url = workerUrl(session);
  deps.say(
    [
      `The Deployment is deployed, connected and reachable: ${url}`,
      `Until Sign-in is set up, it refuses every Tool call.`,
      `Next, register it in Entra ID (guide section 5) with this redirect URI:`,
      `  ${url}/oauth/callback`,
      `then run: npm run setup -- signin`,
    ].join("\n"),
  );
}

type Session = { worker: string; config: OperatorConfig; accountId: string; api: Cloudflare; subdomain: string };

/** The other forms work on a Deployment setup already made, named by its Operator file. */
async function openDeployment(deps: SetupDeps): Promise<Session> {
  const workers = operatorWorkers(deps.files.list());
  if (workers.length === 0) throw new SetupStopped("No Deployment's config file is here. Run npm run setup first, from the folder it was run in.");
  const worker = await deps.ask({ key: "worker", text: "Worker name", choices: workers, ...(workers.length === 1 ? { default: workers[0] } : {}) });
  const config = readOperator(deps, worker);
  if (!config) throw new SetupStopped(`No config file for ${worker} is here (${operatorPath(worker)}). See guide section 9 for a lost config file.`);
  const { accountId, api } = await signedIn(deps, config.account_id);
  return { worker, config, accountId, api, subdomain: await requireSubdomain(api) };
}

/** `npm run setup -- deploy`: the current template and the Operator's file, merged, deployed and checked (D-106). */
async function deployAndCheck(deps: SetupDeps, s: Session, check: "scripts/smoke.mjs" | "scripts/smoke-signin.mjs") {
  const path = deployPath(s.worker);
  deps.files.write(path, JSON.stringify(mergeConfig(template(), s.config), null, 2));
  let result: RunResult;
  try {
    result = await deps.wrangler(["deploy", "-c", path], { accountId: s.accountId });
  } finally {
    deps.files.remove(path);
  }
  if (result.code !== 0) throw new SetupStopped(`wrangler deploy failed:\n${result.stderr || result.stdout}\nFix what it names and rerun the same command.`);
  await checkUntil(deps, s, check);
}

/** The smoke checks, retried while a new workers.dev hostname starts resolving. */
async function checkUntil(deps: SetupDeps, s: Session, check: "scripts/smoke.mjs" | "scripts/smoke-signin.mjs") {
  const url = workerUrl(s);
  for (let waited = 0; ; waited += SMOKE_EVERY_MS) {
    const r = await deps.script(check, url);
    if (r.code === 0) return;
    if (waited + SMOKE_EVERY_MS > SMOKE_FOR_MS) {
      throw new SetupStopped(`The ${check === "scripts/smoke.mjs" ? "smoke" : "Sign-in smoke"} checks still fail after two minutes:\n${r.stdout}${r.stderr}\nGuide section 9 says what each failure means.`);
    }
    await deps.sleep(SMOKE_EVERY_MS);
  }
}

/** `npm run setup -- signin`: the Identity provider's settings and secret, then a redeploy and its checks. */
async function signin(deps: SetupDeps, s: Session) {
  const tenant = await askValid(
    deps,
    { key: "tenant", text: "Entra tenant id, or another provider's issuer URL", default: tenantOf(s.config.vars.IDP_ISSUER) },
    // A wrong tenant is caught by the Sign-in smoke checks, at the Identity provider itself.
    (v) => (/^https:\/\/\S+$/.test(v) || /^[^\s/:]+$/.test(v) ? undefined : "Give the tenant id or an https issuer URL."),
  );
  const issuer = tenant.startsWith("https://") ? tenant : `https://login.microsoftonline.com/${tenant}/v2.0`;
  const clientId = await askValid(deps, { key: "clientId", text: "Application (client) id", default: s.config.vars.IDP_CLIENT_ID }, nonEmpty);
  const clientSecret = await askValid(deps, { key: "clientSecret", text: "Client secret value (hidden)", hidden: true }, nonEmpty);
  s.config = { ...s.config, vars: { ...s.config.vars, IDP_ISSUER: issuer, IDP_CLIENT_ID: clientId } };
  writeOperator(deps, s.config);
  await putSecret(deps, s, "IDP_CLIENT_SECRET", clientSecret);
  await deployAndCheck(deps, s, "scripts/smoke-signin.mjs");
  deps.say(`Sign-in is set up. Staff members can now add ${workerUrl(s)}/mcp to Claude or ChatGPT (staff.md).`);
}

/** `npm run setup -- password`: a new password, given to the role by its verifier and to Hyperdrive by the API. */
async function rotatePassword(deps: SetupDeps, s: Session) {
  if (!s.config.hyperdrive_id) throw new SetupStopped("This Deployment has no Hyperdrive config yet. Run npm run setup to finish it.");
  const password = generatePassword(deps);
  const verifier = scramVerifier(password, deps.randomBytes(16));
  await deps.pause(`Run this SQL as postgres in the Supabase SQL editor, then press Enter here.\n\n${alterRoleSql(s.config.database_account, verifier)}`);
  try {
    await s.api.updateHyperdrive(s.config.hyperdrive_id, { password });
  } catch (e) {
    throw new SetupStopped(`Cloudflare did not update the Hyperdrive config's password: ${message(e)}. Rerun npm run setup -- password.`);
  }
  await checkUntil(deps, s, "scripts/smoke.mjs");
  deps.say("The Database account's password is changed, and the Deployment still reaches the Database.");
}

/** `npm run setup -- remove`: the Worker, its Hyperdrive config and its file; nothing the file does not name. */
async function remove(deps: SetupDeps, s: Session) {
  const typed = await deps.ask({ key: "confirmRemove", text: `This deletes the Worker ${s.worker} and its Hyperdrive config. Type the Worker's name to confirm` });
  if (typed !== s.worker) throw new SetupStopped("Nothing was removed.");
  const del = await deps.wrangler(["delete", s.worker, "--force"], { accountId: s.accountId });
  if (del.code !== 0) throw new SetupStopped(`wrangler delete failed:\n${del.stderr || del.stdout}`);
  if (s.config.hyperdrive_id) {
    const hd = await deps.wrangler(["hyperdrive", "delete", s.config.hyperdrive_id], { accountId: s.accountId });
    if (hd.code !== 0) throw new SetupStopped(`The Worker is deleted, but its Hyperdrive config was not:\n${hd.stderr || hd.stdout}`);
  }
  deps.files.remove(operatorPath(s.worker));
  deps.say(
    [
      `Removed the Worker ${s.worker}, its Hyperdrive config and its config file.`,
      `To finish, run this as postgres in the Supabase SQL editor:`,
      dropRoleSql(s.config.database_account),
      `and delete the app registration in Entra ID (guide section 8).`,
    ].join("\n"),
  );
}

async function signedIn(deps: SetupDeps, knownAccount?: string) {
  const who = await deps.wrangler(["whoami", "--json"]);
  if (who.code !== 0) throw new SetupStopped("Wrangler is not signed in to Cloudflare. Run npx wrangler login, then rerun the same command.");
  const accounts = (JSON.parse(who.stdout) as { accounts?: { id: string; name: string }[] }).accounts ?? [];
  let accountId = knownAccount ?? accounts[0]?.id;
  if (!knownAccount && accounts.length > 1) {
    const choice = await deps.ask({ key: "account", text: "Which Cloudflare account?", choices: accounts.map((a) => a.name) });
    accountId = accounts.find((a) => a.name === choice)?.id;
  }
  if (!accountId || !accounts.some((a) => a.id === accountId)) throw new SetupStopped("Wrangler's sign-in does not reach that Cloudflare account. Run npx wrangler login with the right account, then rerun.");
  const token = await deps.wrangler(["auth", "token", "--json"], { accountId });
  if (token.code !== 0) throw new SetupStopped("Wrangler could not give its sign-in token. Run npx wrangler login, then rerun the same command.");
  const credentials = JSON.parse(token.stdout) as Credentials;
  return { accountId, api: cloudflare(deps.fetch, credentials, accountId) };
}

async function requireSubdomain(api: Cloudflare) {
  const subdomain = await api.subdomain();
  if (!subdomain) {
    throw new SetupStopped("This Cloudflare account has no workers.dev subdomain yet. In the dashboard, open Workers & Pages, choose a subdomain, then rerun the same command.");
  }
  return subdomain;
}

async function secretNames(deps: SetupDeps, s: Session) {
  const r = await deps.wrangler(["secret", "list", "--name", s.worker, "--format", "json"], { accountId: s.accountId });
  return r.code === 0 ? (JSON.parse(r.stdout) as { name: string }[]).map((x) => x.name) : [];
}

async function putSecret(deps: SetupDeps, s: Session, name: string, value: string) {
  const r = await deps.wrangler(["secret", "put", name, "--name", s.worker], { accountId: s.accountId, stdin: value });
  if (r.code !== 0) throw new SetupStopped(`wrangler secret put ${name} failed:\n${r.stderr || r.stdout}\nRerun the same command.`);
}

function readOperator(deps: SetupDeps, worker: string): OperatorConfig | undefined {
  const text = deps.files.read(operatorPath(worker));
  return text === undefined ? undefined : (parseJsonc(text) as OperatorConfig);
}

function writeOperator(deps: SetupDeps, config: OperatorConfig) {
  deps.files.write(operatorPath(config.name), operatorText(config));
}

async function askValid(deps: SetupDeps, prompt: Prompt, check: (v: string) => string | undefined): Promise<string> {
  for (;;) {
    const v = (await deps.ask(prompt)).trim();
    const problem = check(v);
    if (!problem) return v;
    deps.say(problem);
  }
}

const nonEmpty = (v: string) => (v ? undefined : "This cannot be blank.");
const generatePassword = (deps: SetupDeps) => Buffer.from(deps.randomBytes(32)).toString("base64url");
const workerUrl = (s: Session) => `https://${s.worker}.${s.subdomain}.workers.dev`;
const withoutPassword = ({ password: _, ...o }: HyperdriveOrigin) => o;
const tenantOf = (issuer?: string) => issuer?.match(/^https:\/\/login\.microsoftonline\.com\/([^/]+)\/v2\.0$/)?.[1] ?? issuer;
const message = (e: unknown) => (e instanceof CloudflareError || e instanceof Error ? e.message : String(e));
