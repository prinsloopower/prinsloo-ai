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
import { wranglerRunner } from "./lib/wrangler.js";

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
  const options = p.choices ? ` [${p.choices.join(" / ")}]` : "";
  const fallback = p.default ? ` (${p.default})` : "";
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (p.hidden) {
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
    let prompted = false;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
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

const runScript = (path: string, url: string) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, path), url], { cwd: ROOT, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });

try {
  await setup(form, {
    ask,
    pause: (text) => ask({ key: "pause", text: `${text}\nPress Enter when done` }).then(() => undefined),
    say: (text) => console.log(text),
    wrangler: wranglerRunner(ROOT, spawn),
    fetch,
    script: runScript,
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
  if (e instanceof SetupStopped) {
    console.error(`\nStopped: ${e.message}`);
    process.exitCode = 1;
  } else {
    throw e;
  }
}
