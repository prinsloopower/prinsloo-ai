/**
 * Builds the clean copy of the Server and its Deployment kit (D-111): `npm run export`, which
 * writes ../sql-mcp. It copies an explicit list of tracked files, rewrites the few that must
 * differ, and refuses to finish if any reference to the development process, or any identifier
 * of the project test Deployment, remains.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Tracked paths the copy takes, as files or folder prefixes. */
const INCLUDE = [
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
const EXCLUDE = ["test/bench/", "test/export/"];

/** References to the development process: register and phase IDs, and its documents. */
const PROCESS = [
  /\b(?:D|Q|R|J|S|T|ADR)-\d{3}\b/,
  /\.sdlc\b|ai-sdlc|docs\/slices|system-spec|system spec|deployment-trials/i,
  /\b(?:operations|security|data-model|environments|components|adr|overview|skeleton|discovery|journeys|prd|domain-model|decisions|questions)\.md\b/,
  /product owner|\bbench\/|benchmark/i,
];
/** The project test Deployment's identifiers, which no Operator's copy should carry. */
const IDENTIFIERS = [
  /sql-mcp-server\.prinsloopower\.workers\.dev/,
  /9416b60e-03b2-44ee-84ff-5d25e16cf730/,
  /24fa586e-d5e5-48d4-84a1-eab2a18db9bb/,
  /eb6eadef54d546ae84c12c419a4c2d9f/,
  /dwsikgvekndbmowzdcnx/,
  /AI Golf App/i,
];
/** Files the check reads as text; the lockfile is read too, since a name can hide anywhere. */
const TEXT = /\.(ts|mjs|js|json|jsonc|md|sql|yml|yaml|example)$|^(LICENSE|\.gitignore|\.gitattributes)$/;

const HERE = dirname(fileURLToPath(import.meta.url));

/** Writes the clean copy of `from` into `to`, then checks it. Throws, listing every problem, if the check fails. */
export function exportTree(from: string, to: string): void {
  prepare(to);
  const tracked = execFileSync("git", ["ls-files"], { cwd: from, encoding: "utf8" }).split("\n").filter(Boolean);
  const files = tracked.filter((f) => INCLUDE.some((i) => (i.endsWith("/") ? f.startsWith(i) : f === i)) && !EXCLUDE.some((e) => f.startsWith(e)));
  for (const f of files) {
    mkdirSync(dirname(join(to, f)), { recursive: true });
    copyFileSync(join(from, f), join(to, f));
  }
  rewrite(to);
  const problems = checkTree(to);
  if (problems.length > 0) throw new Error(`The clean copy still refers to the development process or the project:\n${problems.join("\n")}`);
}

/** The files that must differ from this folder's. */
function rewrite(to: string) {
  copyFileSync(join(HERE, "LICENSE"), join(to, "LICENSE"));
  copyFileSync(join(HERE, "wrangler.public.jsonc"), join(to, "wrangler.jsonc"));

  const pkgPath = join(to, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts: Record<string, string> };
  delete pkg.scripts.benchmark;
  delete pkg.scripts.export;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const tsPath = join(to, "tsconfig.json");
  const ts = JSON.parse(readFileSync(tsPath, "utf8")) as { include: string[] };
  ts.include = ts.include.filter((i) => i !== "bench" && i !== "release");
  writeFileSync(tsPath, `${JSON.stringify(ts, null, 2)}\n`);

  writeFileSync(join(to, ".gitignore"), "node_modules/\n.wrangler/\n.dev.vars\ndist/\n/wrangler.*.jsonc\n");
  writeFileSync(
    join(to, ".gitattributes"),
    "# Source and documents stay LF on every platform.\n*.ts text eol=lf\n*.jsonc text eol=lf\n*.md text eol=lf\n*.sql text eol=lf\n",
  );
}

/** Every tracked-looking file under `root`, as a forward-slash path; node_modules is skipped. */
export function listTree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== "node_modules") walk(full);
      } else {
        out.push(relative(root, full).split(sep).join("/"));
      }
    }
  };
  walk(root);
  return out.sort();
}

/** Each line under `root` that refers to the development process or the project, as `path:line: text`. */
export function checkTree(root: string): string[] {
  const problems: string[] = [];
  for (const f of listTree(root)) {
    if (!TEXT.test(f.split("/").pop()!)) continue;
    readFileSync(join(root, f), "utf8")
      .split("\n")
      .forEach((line, i) => {
        if ([...PROCESS, ...IDENTIFIERS].some((p) => p.test(line))) problems.push(`${f}:${i + 1}: ${line.trim().slice(0, 160)}`);
      });
  }
  return problems;
}

/** Empties `to` for a fresh copy, keeping an installed node_modules; refuses a folder that is not an earlier copy. */
function prepare(to: string) {
  if (existsSync(to)) {
    const there = readdirSync(to);
    const own = there.length === 0 || (there.includes("LICENSE") && readFileSync(join(to, "LICENSE"), "utf8").includes("Prinsloo AI"));
    if (!own || there.includes(".sdlc") || there.includes(".git")) throw new Error(`${to} is not an earlier clean copy, so it was left alone.`);
    for (const name of there) if (name !== "node_modules") rmSync(join(to, name), { recursive: true, force: true });
  }
  mkdirSync(to, { recursive: true });
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
