import type { Prompt, RunResult, SetupDeps } from "../../deploy/cloudflare/lib/setup.js";

/** A fake Cloudflare account and terminal for the setup command: Wrangler, the API, the Operator's answers and files. */
export type World = ReturnType<typeof world>;

export const ACCOUNT = "acc-1";
export const OAUTH_TOKEN = "oauth-token-secret-value";
export const SUBDOMAIN = "prinsloo";

type Worker = { secrets: Set<string>; vars: Record<string, string>; hyperdriveId?: string };
type Hyperdrive = { id: string; name: string; origin: Record<string, unknown>; caching: unknown };

export function world(answers: Record<string, string> = {}) {
  const state = {
    loggedIn: true,
    accounts: [{ id: ACCOUNT, name: "Prinsloo" }],
    subdomain: SUBDOMAIN as string | null,
    workers: new Map<string, Worker>(),
    hyperdrives: new Map<string, Hyperdrive>(),
    failOn: null as null | ((args: string[]) => boolean),
    smokeFailures: 0,
    hyperdriveRefuses: false,
  };
  const calls: { args: string[]; accountId?: string; stdin?: string }[] = [];
  const requests: { method: string; url: string; headers: Record<string, string>; body?: string }[] = [];
  const scripts: { path: string; url: string }[] = [];
  const asked: Prompt[] = [];
  const said: string[] = [];
  const paused: string[] = [];
  const files = new Map<string, string>();
  const deployed: { config: Record<string, unknown>; path: string }[] = [];
  let counter = 0;
  let slept = 0;
  let nextId = 1;

  const ok = (stdout = ""): RunResult => ({ code: 0, stdout, stderr: "" });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const deps: SetupDeps = {
    async ask(p) {
      asked.push(p);
      const a = answers[p.key];
      if (a !== undefined) return a;
      if (p.default !== undefined) return p.default;
      throw new Error(`the test gave no answer for ${p.key}`);
    },
    async pause(text) {
      paused.push(text);
    },
    say(text) {
      said.push(text);
    },
    async wrangler(args, opts = {}) {
      calls.push({ args, ...opts });
      if (state.failOn?.(args)) return { code: 1, stdout: "", stderr: `failed: ${args.join(" ")}` };
      const [cmd, sub] = args;
      if (cmd === "whoami") {
        return state.loggedIn ? ok(JSON.stringify({ loggedIn: true, accounts: state.accounts })) : { code: 1, stdout: "", stderr: "not logged in" };
      }
      if (cmd === "auth" && sub === "token") return ok(JSON.stringify({ type: "oauth", token: OAUTH_TOKEN }));
      const name = args[args.indexOf("--name") + 1]!;
      if (cmd === "secret" && sub === "list") return ok(JSON.stringify([...(state.workers.get(name)?.secrets ?? [])].map((n) => ({ name: n, type: "secret_text" }))));
      if (cmd === "secret" && sub === "put") {
        const w = state.workers.get(name) ?? { secrets: new Set<string>(), vars: {} };
        w.secrets.add(args[2]!);
        state.workers.set(name, w);
        return ok();
      }
      if (cmd === "deploy") {
        const path = args[args.indexOf("-c") + 1]!;
        const config = JSON.parse(files.get(path)!) as { name: string; vars: Record<string, string>; hyperdrive: { id: string }[] };
        deployed.push({ config, path });
        const w = state.workers.get(config.name) ?? { secrets: new Set<string>(), vars: {} };
        w.vars = config.vars;
        w.hyperdriveId = config.hyperdrive[0]!.id;
        state.workers.set(config.name, w);
        return ok(`Deployed ${config.name}\n  https://${config.name}.${SUBDOMAIN}.workers.dev`);
      }
      if (cmd === "delete") {
        state.workers.delete(args[1]!);
        return ok();
      }
      if (cmd === "hyperdrive" && sub === "delete") {
        state.hyperdrives.delete(args[2]!);
        return ok();
      }
      throw new Error(`the fake Wrangler has no ${args.join(" ")}`);
    },
    async fetch(input, init) {
      const req = new Request(input, init);
      const body = req.method === "GET" || req.method === "DELETE" ? undefined : await req.text();
      requests.push({ method: req.method, url: req.url, headers: Object.fromEntries(req.headers), body });
      const path = new URL(req.url).pathname.replace(/^\/client\/v4/, "");
      const m = path.match(/^\/accounts\/([^/]+)(\/.*)$/);
      if (!m || m[1] !== ACCOUNT) return json(404, { success: false, errors: [{ message: "no such account" }] });
      const rest = m[2]!;
      if (rest === "/workers/subdomain") {
        return state.subdomain ? json(200, { success: true, result: { subdomain: state.subdomain } }) : json(404, { success: false, errors: [{ code: 10007 }] });
      }
      const settings = rest.match(/^\/workers\/scripts\/([^/]+)\/settings$/);
      if (settings) {
        const w = state.workers.get(settings[1]!);
        if (!w) return json(404, { success: false, errors: [{ code: 10007, message: "workers.api.error.script_not_found" }] });
        const bindings = [
          ...Object.entries(w.vars).map(([n, text]) => ({ type: "plain_text", name: n, text })),
          ...(w.hyperdriveId ? [{ type: "hyperdrive", name: "HYPERDRIVE", id: w.hyperdriveId }] : []),
          ...[...w.secrets].map((n) => ({ type: "secret_text", name: n })),
        ];
        return json(200, { success: true, result: { bindings } });
      }
      if (rest === "/hyperdrive/configs" && req.method === "GET") {
        return json(200, { success: true, result: [...state.hyperdrives.values()].map(({ origin, ...h }) => ({ ...h, origin: { ...origin, password: undefined } })) });
      }
      if (rest === "/hyperdrive/configs" && req.method === "POST") {
        if (state.hyperdriveRefuses) return json(400, { success: false, errors: [{ message: "Failed to connect to the origin" }] });
        const b = JSON.parse(body!) as Omit<Hyperdrive, "id">;
        const h = { ...b, id: `hd-${nextId++}` };
        state.hyperdrives.set(h.id, h);
        return json(200, { success: true, result: { ...h, origin: { ...h.origin, password: undefined } } });
      }
      const one = rest.match(/^\/hyperdrive\/configs\/([^/]+)$/);
      if (one && req.method === "PATCH") {
        const h = state.hyperdrives.get(one[1]!);
        if (!h) return json(404, { success: false, errors: [{ message: "no such config" }] });
        const b = JSON.parse(body!) as Partial<Hyperdrive>;
        if (b.origin) h.origin = { ...h.origin, ...b.origin };
        if (b.caching) h.caching = b.caching;
        return json(200, { success: true, result: { ...h, origin: { ...h.origin, password: undefined } } });
      }
      return json(404, { success: false, errors: [{ message: `the fake API has no ${req.method} ${rest}` }] });
    },
    async script(path, url) {
      scripts.push({ path, url });
      if (state.smokeFailures > 0) {
        state.smokeFailures--;
        return { code: 1, stdout: "FAIL  healthz reaches the Database", stderr: "" };
      }
      return ok("PASS  every check");
    },
    files: {
      read: (p) => files.get(p),
      write: (p, s) => void files.set(p, s),
      remove: (p) => void files.delete(p),
      list: () => [...files.keys()],
    },
    randomBytes(n) {
      return Uint8Array.from({ length: n }, () => (counter++ * 37 + 11) % 256);
    },
    async sleep(ms) {
      slept += ms;
    },
  };

  /** Every value that must never appear in an argument, a file, the terminal or the config. */
  const secrets = () => {
    const out = [OAUTH_TOKEN];
    if (answers.clientSecret) out.push(answers.clientSecret);
    for (const r of requests) {
      const pw = r.body ? (JSON.parse(r.body) as { origin?: { password?: string } }).origin?.password : undefined;
      if (pw) out.push(pw);
    }
    for (const c of calls) if (c.stdin) out.push(c.stdin);
    return out;
  };

  return { deps, state, calls, requests, scripts, asked, said, paused, files, deployed, secrets, slept: () => slept };
}

/** Answers for a first run that deploys the trial Deployment. */
export const TRIAL = {
  worker: "sql-mcp-trial",
  host: "aws-0-us-east-2.pooler.supabase.com",
  port: "5432",
  database: "postgres",
  projectRef: "dwsikgvekndbmowzdcnx",
  role: "sqlmcp_trial",
  schemas: "sales",
  rowLimit: "500",
};

export const operatorFile = (worker = TRIAL.worker) => `wrangler.${worker}.jsonc`;
