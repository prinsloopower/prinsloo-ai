/**
 * Builds the clean copy of the Server and its Deployment kit (D-111): `npm run export`, which
 * writes ../sql-mcp. It copies an explicit list of tracked files into a staging folder, rewrites
 * the few that must differ, and checks the result for any reference to the development process
 * and any identifier of the project test Deployment. Only a copy that passes replaces the target;
 * a refused one is deleted, and the target is left as it was.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  "scripts/mssql-certs.mjs",
  "test/",
  "Dockerfile",
  ".dockerignore",
  "vitest.config.ts",
  "docs/security-material/",
  "docs/settings.md",
  "docs/development.md",
  "README.md",
  ".dev.vars.example",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
];
/**
 * Within those, what stays here: the benchmark's tests, this export's own, and the MS SQL Server tests
 * that read the read-only list from the pipeline's documents, with the measurements they read.
 */
export const EXCLUDE = [
  "test/bench/",
  "test/export/",
  "test/mssql/defaults.int.test.ts",
  "test/mssql/read-only-list.ts",
  "test/mssql/measure-database-defaults.sql",
  "test/mssql/measure-server-defaults.sql",
  "test/mssql/ownership-views.sql",
  "test/mssql/azure-ownership-views.txt",
];
/** Docker's test CA and server certificate and their keys, made on the developer's machine and never shipped. */
const TEST_CERTIFICATES = "test/mssql/certs/";
/** Files the export writes itself rather than copies. */
export const WRITTEN = ["LICENSE", "wrangler.jsonc", ".gitignore", ".gitattributes"];
/**
 * The copy's .gitignore, and the one definition of a local file: what a tried copy holds that the
 * copy does not own. Installed packages, Wrangler's state, local secrets (`.dev.vars*` and `.env*`),
 * build output and Operator files. `.dev.vars.example` is the copy's own, so it is re-included.
 * Docker's test certificates are ignored too, though a re-export, which replaces `test/`, does not keep them.
 */
export const GITIGNORE = ["node_modules/", ".wrangler/", ".dev.vars*", "!.dev.vars.example", ".env*", "dist/", "/wrangler.*.jsonc", TEST_CERTIFICATES];

/** A top-level name GITIGNORE ignores: the last pattern that matches decides, as in git. */
export function keep(name: string): boolean {
  let ignored = false;
  for (const raw of GITIGNORE) {
    const negated = raw.startsWith("!");
    const glob = raw.replace(/^!/, "").replace(/^\//, "").replace(/\/$/, "");
    const re = new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
    if (re.test(name)) ignored = !negated;
  }
  return ignored;
}

/** References to the development process: register and phase IDs, its documents, and its words. */
const PROCESS = [
  /\b(?:D|Q|R|J|S|T|ADR)-\d{3,}\b/,
  /\.sdlc\b|ai-sdlc|docs\/slices|system-spec|system spec|deployment-trials|docs\/architecture/i,
  /\b(?:operations|security|data-model|environments|components|adr|overview|skeleton|discovery|journeys|prd|domain-model|decisions|questions|slices|reflections|state|spec|review|deploy|pipeline|contract)\.(?:md|json)\b/i,
  // The words slice, slices, sliced and slicing, standing alone or hyphenated, but not a `.slice(`
  // call or the `slice-ansi` package, which are code; a compound such as "subslice" is not caught.
  /(?<![.\w])slic(?:es?|ed|ing)\b(?!-ansi)|code review|design review|re-review|review round|\bgates? ?-?\d|amendment gate|\bcritique/i,
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
  // The Azure tenant's domain, the subscription and the Database server.
  /Prinsloo147/i,
  /f3773fcf-7f0c-445f-9184-b50b3e74a99c/,
  /\bprinslooai\b/i,
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
    // NUL-delimited, so git neither quotes nor escapes a path.
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: from, encoding: "utf8" }).split("\0").filter(Boolean);
    for (const f of tracked.filter((t) => listed(t, include))) {
      mkdirSync(dirname(join(staging, f)), { recursive: true });
      copyFileSync(join(from, f), join(staging, f));
    }
    rewrite(staging);
    const problems = checkTree(staging);
    if (problems.length > 0) {
      throw new Error(`The clean copy was refused, and ${to} was left as it was. It still refers to the development process or the project:\n${problems.join("\n")}`);
    }
    swapInto(staging, to);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** The file operations the swap makes, so a test can make one fail. */
export type SwapFs = { renameSync: typeof renameSync; cpSync: typeof cpSync; rmSync: typeof rmSync };

/**
 * Replaces `to`'s exported files with `staging`'s, leaving its local files alone.
 *
 * Moving each old entry aside, into a folder beside `to`, is the check that it can be replaced. If
 * one cannot be moved (a file locked on Windows, say), the entries just moved are moved straight
 * back, and `to` is as it was. Only when every old entry is aside is the new copy written. If that
 * write fails, nothing is undone: the error says the copy is incomplete and where the old one is.
 */
export function swapInto(staging: string, to: string, fs: SwapFs = { renameSync, cpSync, rmSync }) {
  mkdirSync(to, { recursive: true });
  const aside = mkdtempSync(`${to}.previous-`);
  const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const movedAside: string[] = [];
  try {
    for (const name of readdirSync(to).filter((n) => !keep(n))) {
      fs.renameSync(join(to, name), join(aside, name));
      movedAside.push(name);
    }
  } catch (e) {
    const notBack: string[] = [];
    for (const name of movedAside) {
      try {
        fs.renameSync(join(aside, name), join(to, name));
      } catch (back) {
        notBack.push(`${name} (${why(back)})`);
      }
    }
    if (notBack.length > 0) {
      throw new Error(`${to} is in use, so the clean copy was not written (${why(e)}). These old entries are still in ${aside}; move them back: ${notBack.join(", ")}.`);
    }
    fs.rmSync(aside, { recursive: true, force: true });
    throw new Error(`${to} is in use, so the clean copy was not written and ${to} was left as it was: ${why(e)}. Close what holds it, then export again.`);
  }
  try {
    fs.cpSync(staging, to, { recursive: true });
  } catch (e) {
    throw new Error(`The clean copy was only partly written to ${to} (${why(e)}). The previous copy is in ${aside}. Export again.`);
  }
  try {
    fs.rmSync(aside, { recursive: true, force: true });
  } catch (e) {
    throw new Error(`The clean copy was written to ${to}, but the previous copy, moved aside to ${aside}, could not be deleted (${why(e)}). Delete that folder.`);
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

  // The same list the export keeps by, so nothing it keeps can be committed, and nothing ignored is lost.
  writeFileSync(join(to, ".gitignore"), `${GITIGNORE.join("\n")}\n`);
  writeFileSync(
    join(to, ".gitattributes"),
    "# Text files stay LF on every platform.\n" +
      ["*.ts", "*.mjs", "*.json", "*.jsonc", "*.md", "*.sql", "*.yml", "*.example", "LICENSE", ".gitignore", ".gitattributes"].map((p) => `${p} text eol=lf`).join("\n") +
      "\n",
  );
}

/** Every file under `root`, as a forward-slash path; node_modules and the kept local state are skipped. */
export function listTree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (dir === root && keep(name)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(root, full).split(sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

/**
 * Each line of each text file under `root` that refers to the development process or the project, as
 * `path:line: text`, and each test certificate or key, by its path alone.
 */
export function checkTree(root: string): string[] {
  const problems: string[] = [];
  for (const f of listTree(root)) {
    if (f.startsWith(TEST_CERTIFICATES)) {
      problems.push(`${f}: a test certificate or key`);
      continue;
    }
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
  const there = readdirSync(to).filter((n) => !keep(n));
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
