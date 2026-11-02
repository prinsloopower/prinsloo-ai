import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The Operator's own part of a Deployment's config: `wrangler.<worker name>.jsonc`. It holds no secret. */
export type OperatorConfig = {
  name: string;
  account_id: string;
  hyperdrive_id?: string;
  database_account: string;
  vars: Record<string, string>;
};

export const operatorPath = (worker: string) => `wrangler.${worker}.jsonc`;
/** The merged config handed to `wrangler deploy`, removed once it has run. */
export const deployPath = (worker: string) => `wrangler.${worker}.deploy.jsonc`;
const OPERATOR_FILE = /^wrangler\.([a-z0-9-]+)\.jsonc$/;

/** Worker names that have an Operator file among `paths`. */
export const operatorWorkers = (paths: string[]) => paths.flatMap((p) => p.match(OPERATOR_FILE)?.[1] ?? []);

/** JSON with `//` and `/* *\/` comments and trailing commas, as Wrangler reads it. */
export function parseJsonc(text: string): unknown {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      out += text.slice(start, i + 1);
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 1;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export type Template = Record<string, unknown> & { vars: Record<string, string>; hyperdrive: { binding: string }[] };

export const template = (): Template =>
  parseJsonc(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "wrangler.template.jsonc"), "utf8")) as Template;

/** The config `wrangler deploy` gets: the current template, then the Operator's own part. */
export function mergeConfig(t: Template, o: OperatorConfig): Record<string, unknown> {
  return {
    ...t,
    name: o.name,
    account_id: o.account_id,
    hyperdrive: [{ binding: t.hyperdrive[0]!.binding, id: o.hyperdrive_id }],
    vars: { ...t.vars, ...o.vars },
  };
}

export const operatorText = (o: OperatorConfig) =>
  `// This Deployment's own settings, written by npm run setup (deploy/cloudflare/guide.md).
// It holds no secret. Keep a backup of it. Deploy changes with: npm run setup -- deploy
${JSON.stringify(o, null, 2)}
`;
