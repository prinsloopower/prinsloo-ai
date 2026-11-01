/**
 * The Deployment kit's setup command (S-005): `npm run setup [-- deploy|signin|password|remove]`.
 * deploy/cloudflare/guide.md explains each form and every call it makes.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { type Form, type Prompt, SetupStopped, setup } from "./lib/setup.js";
import { nodeRunner, wranglerRunner } from "./lib/wrangler.js";

const ROOT = process.cwd();
const FORMS: Form[] = ["setup", "deploy", "signin", "password", "remove"];

const form = (process.argv[2] ?? "setup") as Form;
if (!FORMS.includes(form)) {
  console.error(`Unknown form ${form}. Usage: npm run setup [-- ${FORMS.slice(1).join("|")}]`);
  process.exit(2);
}
if (!existsSync(join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js"))) {
  console.error("Run this from the sql-mcp-server folder, after npm ci.");
  process.exit(2);
}

/** One line from the terminal; a hidden prompt echoes nothing of what is typed. */
function ask(p: Prompt): Promise<string> {
  // Without a TTY (Git Bash's mintty, for one), the terminal itself echoes input, so nothing here can hide it.
  if (p.hidden && !process.stdin.isTTY) {
    throw new SetupStopped("This terminal cannot hide what you type, and the next answer is a secret. Run the command in PowerShell or Windows Terminal, or as winpty npm run setup, and rerun it.");
  }
  const options = p.choices ? ` [${p.choices.join(" / ")}]` : "";
  const fallback = p.default ? ` (${p.default})` : "";
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (p.hidden) {
    // readline has no option to hide input. Replacing its private echo, after the prompt is written,
    // is the usual way to do it in Node, and is deliberate here.
    const internal = rl as unknown as { _writeToOutput: (s: string) => void };
    const write = internal._writeToOutput.bind(rl);
    let prompted = false;
    internal._writeToOutput = (s) => {
      if (!prompted) {
        prompted = true;
        write(s);
      }
    };
  }
  return new Promise((resolve) => {
    rl.question(`${p.text}${options}${fallback}: `, (answer) => {
      rl.close();
      if (p.hidden) process.stdout.write("\n");
      resolve(answer.trim() || p.default || "");
    });
  });
}

const node = nodeRunner(ROOT, spawn);

try {
  await setup(form, {
    ask,
    pause: (text) => ask({ key: "pause", text: `${text}\nPress Enter when done` }).then(() => undefined),
    say: (text) => console.log(text),
    wrangler: wranglerRunner(ROOT, spawn),
    fetch,
    script: (path, url) => node(path, [url]),
    files: {
      read: (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : undefined),
      write: (p, text) => writeFileSync(join(ROOT, p), text),
      remove: (p) => rmSync(join(ROOT, p), { force: true }),
      list: () => readdirSync(ROOT),
    },
    randomBytes: (n) => randomBytes(n),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
} catch (e) {
  // One line, as bench/run.ts does. A stop already says what to do; anything else is named, not traced.
  console.error(e instanceof SetupStopped ? `\nStopped: ${e.message}` : `\nSetup could not run: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
