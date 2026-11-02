/**
 * Builds the clean copy of the Server and its Deployment kit (D-111): `npm run export`, which
 * writes ../sql-mcp. It copies an explicit list of tracked files into a staging folder, rewrites
 * the few that must differ, and checks the result for any reference to the development process
 * and any identifier of the project test Deployment. Only a copy that passes replaces the target;
 * a refused one is deleted, and the target is left as it was.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonc } from "../deploy/cloudflare/lib/config.js";

/** Tracked paths the copy takes, as files or folder prefixes. */
export const INCLUDE = [
  "src/",
  "deploy/",
  "scripts/smoke.mjs",
  "scripts/smoke-signin.mjs",
  "test/",
  "docs/security-material/",
  "docs/settings.md",
  "docs/development.md",
  "README.md",
  ".dev.vars.example",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
];
/** Within those, what stays here: the benchmark's tests and this export's own. */
export const EXCLUDE = ["test/bench/", "test/export/"];
/** Files the export writes itself rather than copies. */
export const WRITTEN = ["LICENSE", "wrangler.jsonc", ".gitignore", ".gitattributes"];
/** What a re-export keeps in the target: installed packages, and a tried copy's local secrets, state and Operator files. */
const KEEP = /^(node_modules|\.dev\.vars|\.wrangler|wrangler\.[a-z0-9-]+\.jsonc)$/;

/** References to the development process: register and phase IDs, its documents, and its words. */
const PROCESS = [
  /\b(?:D|Q|R|J|S|T|ADR)-\d{3,}\b/,
  /\.sdlc\b|ai-sdlc|docs\/slices|system-spec|system spec|deployment-trials|docs\/architecture/i,
  /\b(?:operations|security|data-model|environments|components|adr|overview|skeleton|discovery|journeys|prd|domain-model|decisions|questions|slices|reflections|state)\.(?:md|json)\b/,
  /(?<![.\w])slices?\b|code review|design review|re-review|review round/i,
  /product owner|\bbench\/|benchmark/i,
];
/** The project test Deployment's identifiers, which no Operator's copy should carry. */
const IDENTIFIERS = [
  /[a-z0-9-]+\.prinsloopower\.workers\.dev/,
  /9416b60e-03b2-44ee-84ff-5d25e16cf730/,
  /24fa586e-d5e5-48d4-84a1-eab2a18db9bb/,
  /eb6eadef54d546ae84c12c419a4c2d9f/,
  /dwsikgvekndbmowzdcnx/,
  /AI Golf App/i,
];

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Writes the clean copy of `from` into `to`. It is built and checked in a staging folder first;
 * only a copy that passes replaces `to`. Throws, listing every problem, if the check fails.
 * `include` replaces INCLUDE, for tests.
 */
export function exportTree(from: string, to: string, include: string[] = INCLUDE): void {
  refuseUnlessCopy(to);
  const staging = mkdtempSync(join(tmpdir(), "sql-mcp-export-"));
  try {
    const tracked = execFileSync("git", ["ls-files"], { cwd: from, encoding: "utf8" }).split("\n").filter(Boolean);
    for (const f of tracked.filter((t) => listed(t, include))) {
      mkdirSync(dirname(join(staging, f)), { recursive: true });
      copyFileSync(join(from, f), join(staging, f));
    }
    rewrite(staging);
    const problems = checkTree(staging);
    if (problems.length > 0) {
      throw new Error(`The clean copy was refused, and ${to} was left as it was. It still refers to the development process or the project:\n${problems.join("\n")}`);
    }
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(to)) if (!KEEP.test(name)) rmSync(join(to, name), { recursive: true, force: true });
    cpSync(staging, to, { recursive: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Whether a tracked path is one the copy takes. */
export const listed = (f: string, include: string[] = INCLUDE) =>
  include.some((i) => (i.endsWith("/") ? f.startsWith(i) : f === i)) && !EXCLUDE.some((e) => f.startsWith(e));

/** The files that must differ from this folder's. */
function rewrite(to: string) {
  copyFileSync(join(HERE, "LICENSE"), join(to, "LICENSE"));
  copyFileSync(join(HERE, "wrangler.public.jsonc"), join(to, "wrangler.jsonc"));

  // The benchmark and the export stay here. `deploy` would deploy the development config; Operators
  // deploy with `npm run setup -- deploy`.
  const pkgPath = join(to, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts: Record<string, string> };
  for (const script of ["benchmark", "export", "deploy"]) delete pkg.scripts[script];
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const tsPath = join(to, "tsconfig.json");
  const ts = parseJsonc(readFileSync(tsPath, "utf8")) as { include: string[] };
  ts.include = ts.include.filter((i) => i !== "bench" && i !== "release");
  writeFileSync(tsPath, `${JSON.stringify(ts, null, 2)}\n`);

  writeFileSync(join(to, ".gitignore"), "node_modules/\n.wrangler/\n.dev.vars\ndist/\n/wrangler.*.jsonc\n");
  writeFileSync(
    join(to, ".gitattributes"),
    "# Text files stay LF on every platform.\n" + ["*.ts", "*.mjs", "*.json", "*.jsonc", "*.md", "*.sql", "*.yml", "*.example"].map((p) => `${p} text eol=lf`).join("\n") + "\n",
  );
}

/** Every file under `root`, as a forward-slash path; node_modules and the kept local state are skipped. */
export function listTree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (dir === root && KEEP.test(name)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(root, full).split(sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

/** Each line of each text file under `root` that refers to the development process or the project, as `path:line: text`. */
export function checkTree(root: string): string[] {
  const problems: string[] = [];
  for (const f of listTree(root)) {
    const bytes = readFileSync(join(root, f));
    // A NUL byte marks a binary file, which holds no prose to check.
    if (bytes.subarray(0, 8000).includes(0)) continue;
    bytes
      .toString("utf8")
      .split("\n")
      .forEach((line, i) => {
        if ([...PROCESS, ...IDENTIFIERS].some((p) => p.test(line))) problems.push(`${f}:${i + 1}: ${line.trim().slice(0, 160)}`);
      });
  }
  return problems;
}

/**
 * Refuses a target that is not an earlier clean copy: one that is missing or empty, or that holds
 * the Server and its kit and nothing of this folder's process or of another repository.
 */
function refuseUnlessCopy(to: string) {
  if (!existsSync(to)) return;
  const there = readdirSync(to).filter((n) => !KEEP.test(n));
  if (there.length === 0) return;
  const isCopy =
    existsSync(join(to, "src", "worker.ts")) &&
    existsSync(join(to, "deploy", "cloudflare", "guide.md")) &&
    !["release", ".sdlc", ".git", "bench"].some((n) => there.includes(n));
  if (!isCopy) throw new Error(`${to} is not an earlier clean copy, so it was left alone.`);
}

// `npm run export [-- <folder>]`: ../sql-mcp unless another folder is given.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const to = resolve(process.argv[2] ?? join(process.cwd(), "..", "sql-mcp"));
  try {
    exportTree(process.cwd(), to);
    console.log(`Wrote the clean copy to ${to}.`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
