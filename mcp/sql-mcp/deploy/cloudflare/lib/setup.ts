import { ROW_LIMIT_MAX, parseBoundary } from "../../../src/config.js";
import { type Binding, type Cloudflare, CloudflareError, type Credentials, type HyperdriveOrigin, cloudflare } from "./cloudflare.js";
import { type OperatorConfig, deployPath, mergeConfig, operatorPath, operatorText, operatorWorkers, parseJsonc, template } from "./config.js";
import { accountSql, dropRoleSql, roleMark, scramVerifier } from "./database-account.js";
import type { RunResult } from "./wrangler.js";

export type { RunResult };

/** The setup command's forms. */
export type Form = "setup" | "deploy" | "signin" | "password" | "remove";

export type Prompt = { key: string; text: string; default?: string; hidden?: boolean; choices?: string[] };
export type CheckScript = "scripts/smoke.mjs" | "scripts/smoke-signin.mjs";

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
  script(path: CheckScript, url: string): Promise<RunResult>;
  files: Files;
  randomBytes(n: number): Uint8Array;
  sleep(ms: number): Promise<void>;
}

/** A step failed, or the Operator stopped it; the message says what happened and what to do. */
export class SetupStopped extends Error {}

/** What the prompt says when Ctrl-C or closed input leaves a question unanswered. */
export const interruptedMessage = (command: string) => `setup was interrupted. Rerun ${command} to carry on from here.`;

const SMOKE_FOR_MS = 120_000;
const SMOKE_EVERY_MS = 10_000;
const WORKER_NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

export async function setup(form: Form, deps: SetupDeps): Promise<void> {
  try {
    if (form === "setup") return await setUpOrResume(deps);
    const opened = await openDeployment(deps);
    if (form === "deploy") return await deployAndCheck(deps, opened, "scripts/smoke.mjs");
    if (form === "signin") return await signin(deps, opened);
    if (form === "password") return await rotatePassword(deps, opened);
    return await remove(deps, opened);
  } catch (e) {
    if (e instanceof CloudflareError) {
      throw new SetupStopped(
        `Cloudflare refused a request: ${e.message}. If Wrangler's Cloudflare login has expired, run npx wrangler login; then rerun the same command.`,
      );
    }
    throw e;
  }
}

/** `npm run setup`: from answers to a deployed, checked Deployment, resuming whatever an earlier run left. */
async function setUpOrResume(deps: SetupDeps) {
  const worker = await askValid(
    deps,
    {
      key: "worker",
      text: "Worker name: a new name, which setup creates, or the name an earlier run used, to carry on (lowercase letters, digits and dashes; also the workers.dev hostname)",
    },
    (v) => (WORKER_NAME.test(v) ? undefined : "Use lowercase letters, digits and dashes, starting and ending with a letter or digit."),
  );
  const existing = readOperator(deps, worker);
  if (!existing) {
    const typed = await deps.ask({
      key: "adopt",
      text: `If ${worker} is a Deployment setup made whose config file is lost, type its name to adopt it with its current settings. For a new Deployment, press Enter`,
      default: "",
    });
    if (typed === worker) return adopt(deps, worker);
    if (typed !== "") throw new SetupStopped(`The Worker was not adopted, and nothing was changed.`);
  }
  const host = await askValid(deps, { key: "host", text: "Supabase session pooler host (Connect → Session pooler, e.g. aws-0-us-east-2.pooler.supabase.com)" }, (v) =>
    /^[a-z0-9.-]+$/i.test(v) ? undefined : "Give the host name alone, with no scheme, port or path.",
  );
  const port = await askValid(deps, { key: "port", text: "Its port", default: "5432" }, (v) => (/^\d{1,5}$/.test(v) ? undefined : "Give a port number."));
  const database = await askValid(deps, { key: "database", text: "Database name", default: "postgres" }, nonEmpty);
  const projectRef = await askValid(deps, { key: "projectRef", text: "Supabase project ref (Project Settings → General → Project ID; also the id in your project's URL)" }, (v) =>
    /^[a-z0-9]+$/.test(v) ? undefined : "Give the project ref alone: lowercase letters and digits.",
  );
  const role = await askValid(
    deps,
    { key: "role", text: "Database account (a new role, dedicated to this Deployment)", default: existing?.database_account ?? "sqlmcp_reader" },
    (v) => {
      if (/^postgres(\.|$)/i.test(v)) {
        throw new SetupStopped("Supabase's postgres role bypasses grants, so the Server refuses it. Choose a new role name, such as sqlmcp_reader, and rerun npm run setup.");
      }
      return ROLE_NAME.test(v) ? undefined : "Use lowercase letters, digits and underscores, starting with a letter.";
    },
  );
  const schemasText = await deps.ask({
    key: "schemas",
    text: "Schemas in the Boundary: the schemas holding the tables the Agent may see, comma-separated, e.g. sales, reporting (blank for none: the grants alone decide)",
    default: (existing ? boundaryOf(existing).schemas : undefined)?.join(", ") ?? "",
  });
  const schemas = schemasText.split(",").map((s) => s.trim()).filter(Boolean);
  const limit = ROW_LIMIT_MAX.toLocaleString("en");
  const rowLimit = await askValid(deps, { key: "rowLimit", text: `Row limit (1–${limit})`, default: existing?.vars.ROW_LIMIT ?? "500" }, (v) =>
    /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= ROW_LIMIT_MAX ? undefined : `Give a whole number from 1 to ${limit}.`,
  );

  // 1. Wrangler's Cloudflare login, the account (asked only if the login reaches several), and its workers.dev subdomain.
  const { accountId, api } = await cloudflareLogin(deps, existing?.account_id);
  const subdomain = await requireSubdomain(api);

  // 2. Never take over a Worker this setup did not make.
  const bindings = await api.workerBindings(worker);
  if (bindings && !existing) {
    throw new SetupStopped(
      `A Worker named ${worker} already exists in this account, and no config file for it is here. ` +
        `If setup made it, rerun npm run setup and type its name to adopt it. Otherwise choose another Worker name.`,
    );
  }
  let hyperdrive = (await api.hyperdrives()).find((h) => h.name === worker);
  let config: OperatorConfig = existing ?? { name: worker, account_id: accountId, database_account: role, vars: {} };
  const { exclude } = boundaryOf(config);
  const vars: Record<string, string> = { ...config.vars, ROW_LIMIT: rowLimit };
  if (schemas.length > 0 || exclude.length > 0) {
    vars.BOUNDARY = JSON.stringify({ ...(schemas.length > 0 ? { schemas } : {}), ...(exclude.length > 0 ? { exclude } : {}) });
  } else {
    delete vars.BOUNDARY;
  }
  config = { ...config, account_id: accountId, database_account: role, vars };

  // 3. The Database account's SQL, unless this Deployment's Hyperdrive config already reaches that role.
  // The same SQL creates the role, or resets the password of the role setup marked for this
  // Deployment, so printing it again after any stop is safe.
  const ours = hyperdrive !== undefined && hyperdrive.id === config.hyperdrive_id;
  const roleChanged = existing !== undefined && existing.database_account !== role;
  // An earlier run here wrote its file before the SQL, then stopped before recording Hyperdrive's id.
  const interrupted = existing !== undefined && !existing.hyperdrive_id;
  let password: string | undefined;
  if (!ours || roleChanged) {
    if (hyperdrive && !ours && !interrupted) {
      const reuse = await deps.ask({
        key: "reuseHyperdrive",
        text: `A Hyperdrive config named ${worker} already exists. Reuse it with these connection details? (yes/no)`,
        default: "no",
      });
      if (reuse !== "yes") {
        throw new SetupStopped(`Nothing was changed. Choose another Worker name, or delete the Hyperdrive config ${worker} in the dashboard, and rerun npm run setup.`);
      }
    }
    // A const, because TypeScript does not narrow `password` across the call below.
    const fresh = generatePassword(deps);
    password = fresh;
    // Written before the SQL is shown, so a rerun after a stop here finds this Deployment's own file.
    writeOperator(deps, config);
    await showAccountSql(deps, role, roleMark(worker, accountId), fresh, "new");
  }

  // 4. Hyperdrive, with caching disabled. The password goes only in the API request.
  const origin: HyperdriveOrigin = { scheme: "postgres", host, port: Number(port), database, user: `${role}.${projectRef}` };
  try {
    hyperdrive = hyperdrive
      ? await api.updateHyperdrive(hyperdrive.id, password ? { ...origin, password } : origin)
      : // With no Hyperdrive config, step 3 always made a password.
        await api.createHyperdrive(worker, { ...origin, password: password! });
  } catch (e) {
    throw new SetupStopped(
      `Cloudflare did not ${hyperdrive ? "update" : "create"} the Hyperdrive config: ${message(e)}. ` +
        `Check the pooler host, port, project ref, database name and Database account, and that the SQL ran, then rerun npm run setup.`,
    );
  }

  // 5. The Operator's own file.
  config = { ...config, hyperdrive_id: hyperdrive.id };
  writeOperator(deps, config);

  // 6–9. SERVER_SECRET, kept if the Worker already has one; then deploy, check, and say what comes next.
  const opened: OpenedDeployment = { worker, config, accountId, api, subdomain };
  await ensureServerSecret(deps, opened, bindings);
  await deployAndCheck(deps, opened, "scripts/smoke.mjs");
  const url = workerUrl(opened);
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

/**
 * A Deployment setup made whose config file is lost: its file is rebuilt from the Worker's current
 * settings and its Hyperdrive config, and nothing else changes, so the next deploy keeps them all.
 */
async function adopt(deps: SetupDeps, worker: string) {
  const { accountId, api } = await cloudflareLogin(deps);
  const subdomain = await requireSubdomain(api);
  const bindings = await api.workerBindings(worker);
  if (!bindings) throw new SetupStopped(`No Worker named ${worker} is in this account, so there is nothing to adopt. Rerun npm run setup for a new Deployment.`);
  const hyperdrives = await api.hyperdrives();
  const id = bindings.find((b) => b.type === "hyperdrive")?.id;
  const hyperdrive = hyperdrives.find((h) => h.id === id && h.name === worker);
  if (!hyperdrive) {
    throw new SetupStopped(`The Worker ${worker} does not use a Hyperdrive config named after it, so setup did not make it. Nothing was adopted.`);
  }
  // Supabase's pooler user is `<role>.<project ref>`, as setup made it.
  const role = hyperdrive.origin.user?.split(".")[0] ?? "";
  if (!ROLE_NAME.test(role) || role === "postgres") {
    throw new SetupStopped(`The Hyperdrive config ${worker} does not connect as a Database account setup could have made, so nothing was adopted.`);
  }
  const vars = Object.fromEntries(bindings.filter((b) => b.type === "plain_text" && b.name !== "ENGINE").map((b) => [b.name, b.text ?? ""]));
  const config: OperatorConfig = { name: worker, account_id: accountId, hyperdrive_id: hyperdrive.id, database_account: role, vars };
  // Stops on a Boundary the Server would refuse, before the file is written.
  boundaryOf(config);
  writeOperator(deps, config);
  const opened: OpenedDeployment = { worker, config, accountId, api, subdomain };
  await ensureServerSecret(deps, opened, bindings);
  await deployAndCheck(deps, opened, "scripts/smoke.mjs");
  deps.say(`Adopted ${worker} with its current settings, into ${operatorPath(worker)}. Keep a backup of that file.`);
}

/** A Deployment setup made, named by its Operator file, with Wrangler's Cloudflare login opened for it. */
type OpenedDeployment = { worker: string; config: OperatorConfig; accountId: string; api: Cloudflare; subdomain: string };

/** The other forms work on a Deployment setup already made. The Worker name is asked only when there is a choice. */
async function openDeployment(deps: SetupDeps): Promise<OpenedDeployment> {
  const workers = operatorWorkers(deps.files.list());
  if (workers.length === 0) throw new SetupStopped("No Deployment's config file is here. Run npm run setup first, from the folder it was run in.");
  const worker = workers.length === 1 ? workers[0]! : await deps.ask({ key: "worker", text: "Worker name", choices: workers });
  const config = readOperator(deps, worker);
  if (!config) throw new SetupStopped(`No config file for ${worker} is here (${operatorPath(worker)}). See guide section 9 for a lost config file.`);
  const { accountId, api } = await cloudflareLogin(deps, config.account_id);
  return { worker, config, accountId, api, subdomain: await requireSubdomain(api) };
}

/** `npm run setup -- deploy`: the current template and the Operator's file, merged, deployed and checked. */
async function deployAndCheck(deps: SetupDeps, d: OpenedDeployment, check: CheckScript) {
  const path = deployPath(d.worker);
  deps.files.write(path, JSON.stringify(mergeConfig(template(), d.config), null, 2));
  let result: RunResult;
  try {
    result = await deps.wrangler(["deploy", "-c", path], { accountId: d.accountId });
  } finally {
    deps.files.remove(path);
  }
  if (result.code !== 0) throw new SetupStopped(`wrangler deploy failed:\n${result.stderr || result.stdout}\nFix what it names and rerun the same command.`);
  await checkUntil(deps, d, check);
}

/** The smoke checks, retried while a new workers.dev hostname starts resolving. */
async function checkUntil(deps: SetupDeps, d: OpenedDeployment, check: CheckScript) {
  const url = workerUrl(d);
  for (let waited = 0; ; waited += SMOKE_EVERY_MS) {
    const r = await deps.script(check, url);
    if (r.code === 0) return;
    if (waited + SMOKE_EVERY_MS > SMOKE_FOR_MS) {
      const which = check === "scripts/smoke.mjs" ? "smoke" : "Sign-in smoke";
      throw new SetupStopped(`The ${which} checks still fail after two minutes:\n${r.stdout}${r.stderr}\nGuide section 9 says what each failure means.`);
    }
    await deps.sleep(SMOKE_EVERY_MS);
  }
}

/** `npm run setup -- signin`: the Identity provider's settings and secret, then a redeploy and its checks. */
async function signin(deps: SetupDeps, d: OpenedDeployment) {
  const tenant = await askValid(
    deps,
    { key: "tenant", text: "Entra tenant id, or another provider's issuer URL", default: tenantOf(d.config.vars.IDP_ISSUER) },
    // A wrong tenant is caught by the Sign-in smoke checks, at the Identity provider itself.
    (v) => (/^https:\/\/\S+$/.test(v) || /^[^\s/:]+$/.test(v) ? undefined : "Give the tenant id or an https issuer URL."),
  );
  const issuer = tenant.startsWith("https://") ? tenant : `https://login.microsoftonline.com/${tenant}/v2.0`;
  const clientId = await askValid(deps, { key: "clientId", text: "Application (client) id", default: d.config.vars.IDP_CLIENT_ID }, nonEmpty);
  const clientSecret = await askValid(deps, { key: "clientSecret", text: "Client secret value (hidden)", hidden: true }, nonEmpty);
  d.config = { ...d.config, vars: { ...d.config.vars, IDP_ISSUER: issuer, IDP_CLIENT_ID: clientId } };
  writeOperator(deps, d.config);
  await putSecret(deps, d, "IDP_CLIENT_SECRET", clientSecret);
  await deployAndCheck(deps, d, "scripts/smoke-signin.mjs");
  deps.say(`Sign-in is set up. Staff members can now add ${workerUrl(d)}/mcp to Claude or ChatGPT (staff.md).`);
}

/** `npm run setup -- password`: a new password, given to the role by its verifier and to Hyperdrive by the API. */
async function rotatePassword(deps: SetupDeps, d: OpenedDeployment) {
  if (!d.config.hyperdrive_id) throw new SetupStopped("This Deployment has no Hyperdrive config yet. Run npm run setup to finish it.");
  const password = generatePassword(deps);
  await showAccountSql(deps, d.config.database_account, roleMark(d.worker, d.accountId), password, "rotation");
  try {
    await d.api.updateHyperdrive(d.config.hyperdrive_id, { password });
  } catch (e) {
    throw new SetupStopped(`Cloudflare did not update the Hyperdrive config's password: ${message(e)}. Rerun npm run setup -- password.`);
  }
  await checkUntil(deps, d, "scripts/smoke.mjs");
  deps.say("The Database account's password is changed, and the Deployment still reaches the Database.");
}

/** `npm run setup -- remove`: the Worker, its Hyperdrive config and its file; nothing the file does not name. */
async function remove(deps: SetupDeps, d: OpenedDeployment) {
  const typed = await deps.ask({ key: "confirmRemove", text: `This deletes the Worker ${d.worker} and its Hyperdrive config. Type the Worker's name to confirm` });
  if (typed !== d.worker) throw new SetupStopped("Nothing was removed.");
  // The typed name is the confirmation. --force skips Wrangler's own prompt, which no one would see,
  // and also deletes the Worker if other Workers bind to it.
  const del = await deps.wrangler(["delete", d.worker, "--force"], { accountId: d.accountId });
  if (del.code !== 0) throw new SetupStopped(`wrangler delete failed:\n${del.stderr || del.stdout}`);
  if (d.config.hyperdrive_id) {
    const hd = await deps.wrangler(["hyperdrive", "delete", d.config.hyperdrive_id], { accountId: d.accountId });
    if (hd.code !== 0) throw new SetupStopped(`The Worker is deleted, but its Hyperdrive config was not:\n${hd.stderr || hd.stdout}`);
  }
  deps.files.remove(operatorPath(d.worker));
  deps.say(
    [
      `Removed the Worker ${d.worker}, its Hyperdrive config and its config file.`,
      `To finish, run this as postgres in the Supabase SQL editor. It drops the role only if setup made it for this Deployment:`,
      dropRoleSql(d.config.database_account, roleMark(d.worker, d.accountId)),
      `and delete the app registration in Entra ID (guide section 8).`,
    ].join("\n"),
  );
}

/** Prints the Database account's SQL with only the password's verifier, and waits while the Operator runs it. */
async function showAccountSql(deps: SetupDeps, role: string, mark: string, password: string, purpose: "new" | "rotation") {
  const sql = accountSql(role, mark, scramVerifier(password, deps.randomBytes(16)));
  const listing =
    purpose === "new"
      ? "It ends by listing what the role can already read: expect no rows (guide section 2)."
      : "It ends by listing what the role can read: the tables and columns granted to it.";
  await deps.pause(
    `Run this SQL as postgres in the Supabase SQL editor, then press Enter here. ` +
      `It creates the role ${role}, or gives a new password to the one setup made for this Deployment. ${listing}\n\n${sql}`,
  );
}

/** Wrangler's own login to Cloudflare, the account to use, and an API client with that login's token. */
async function cloudflareLogin(deps: SetupDeps, knownAccount?: string) {
  const who = await deps.wrangler(["whoami", "--json"]);
  if (who.code !== 0) throw new SetupStopped("Wrangler has no Cloudflare login. Run npx wrangler login, then rerun the same command.");
  const accounts = readJson<{ accounts?: { id: string; name: string }[] }>(who.stdout, "wrangler whoami").accounts ?? [];
  let accountId = knownAccount ?? accounts[0]?.id;
  if (!knownAccount && accounts.length > 1) {
    const choice = await deps.ask({ key: "account", text: "Which Cloudflare account?", choices: accounts.map((a) => a.name) });
    accountId = accounts.find((a) => a.name === choice)?.id;
  }
  if (!accountId || !accounts.some((a) => a.id === accountId)) {
    throw new SetupStopped("Wrangler's Cloudflare login does not reach that account. Run npx wrangler login with the right account, then rerun.");
  }
  const token = await deps.wrangler(["auth", "token", "--json"], { accountId });
  if (token.code !== 0) throw new SetupStopped("Wrangler could not give its Cloudflare login's token. Run npx wrangler login, then rerun the same command.");
  const credentials = readJson<Credentials>(token.stdout, "wrangler auth token");
  return { accountId, api: cloudflare(deps.fetch, credentials, accountId) };
}

async function requireSubdomain(api: Cloudflare) {
  const subdomain = await api.subdomain();
  if (!subdomain) {
    throw new SetupStopped("This Cloudflare account has no workers.dev subdomain yet. In the dashboard, open Workers & Pages, choose a subdomain, then rerun the same command.");
  }
  return subdomain;
}

/** Puts a new SERVER_SECRET only if the Worker's settings, as Cloudflare listed them, have none: a rerun voids no Sign-in. */
async function ensureServerSecret(deps: SetupDeps, d: OpenedDeployment, bindings: Binding[] | undefined) {
  const has = bindings?.some((b) => b.type === "secret_text" && b.name === "SERVER_SECRET") ?? false;
  if (!has) await putSecret(deps, d, "SERVER_SECRET", generatePassword(deps));
}

async function putSecret(deps: SetupDeps, d: OpenedDeployment, name: string, value: string) {
  const r = await deps.wrangler(["secret", "put", name, "--name", d.worker], { accountId: d.accountId, stdin: value });
  if (r.code !== 0) throw new SetupStopped(`wrangler secret put ${name} failed:\n${r.stderr || r.stdout}\nRerun the same command.`);
}

/** Parses a command's JSON output. On failure it names the command and never echoes the output, which may hold a token. */
function readJson<T>(text: string, command: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SetupStopped(`${command} gave output setup cannot read. Reinstall the project's Wrangler with npm ci, then rerun the same command.`);
  }
}

/** The Operator file's Boundary, read as the Server reads it (src/config.ts). */
function boundaryOf(config: OperatorConfig) {
  if (!config.vars.BOUNDARY) return { schemas: undefined, exclude: [] as [string, string][] };
  const b = parseBoundary(config.vars.BOUNDARY);
  if (!b) throw new SetupStopped(`BOUNDARY in ${operatorPath(config.name)} is not a valid Boundary (guide section 8). Fix it and rerun.`);
  return b;
}

function readOperator(deps: SetupDeps, worker: string): OperatorConfig | undefined {
  const text = deps.files.read(operatorPath(worker));
  if (text === undefined) return undefined;
  try {
    return parseJsonc(text) as OperatorConfig;
  } catch {
    throw new SetupStopped(`${operatorPath(worker)} is not valid JSON. Restore it from your backup, or fix it, and rerun.`);
  }
}

function writeOperator(deps: SetupDeps, config: OperatorConfig) {
  deps.files.write(operatorPath(config.name), operatorText(config));
}

/**
 * Asks until `check` passes. `check` returns the problem to show before asking again, or throws
 * SetupStopped where no other answer could help, as for the postgres role.
 */
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
const workerUrl = (d: OpenedDeployment) => `https://${d.worker}.${d.subdomain}.workers.dev`;
const tenantOf = (issuer?: string) => issuer?.match(/^https:\/\/login\.microsoftonline\.com\/([^/]+)\/v2\.0$/)?.[1] ?? issuer;

/** An error's message, for the one line the command prints. */
export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
