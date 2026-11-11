import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { OPERATOR_FILE } from "../../deploy/cloudflare/lib/config.js";
import { INCLUDE, WRITTEN, checkTree, exportTree, keep, listTree, listed, swapInto } from "../../release/export.js";
import { SERVER_INFO } from "../../src/mcp.js";
import { table } from "../markdown.js";

// This folder's own tests of the clean copy (D-111). The export leaves them out, with the
// benchmark's, because they read the pipeline's documents.

const read = (p: string) => readFileSync(p, "utf8");
const fail = (message: string): never => {
  throw new Error(message);
};
/** A spec cell without its parenthesised citations of registers and pipeline documents. */
const uncited = (cell: string) => cell.replace(/ ?\([^()]*(?:\b[A-Z]{1,3}-\d{3}\b|\.md)[^()]*\)/g, "");

let parent: string;
let out: string;
let exportError: unknown;
beforeAll(() => {
  parent = mkdtempSync(join(tmpdir(), "s005-export-"));
  out = join(parent, "sql-mcp");
  try {
    exportTree(process.cwd(), out);
  } catch (e) {
    // Kept, not swallowed: the first test reports it, and the rest fail on what is missing.
    exportError = e;
  }
});
afterAll(() => rmSync(parent, { recursive: true, force: true }));

describe("the clean copy's export", () => {
  it("export_includes_only_listed_files", () => {
    expect(exportError).toBeUndefined();
    const files = listTree(out);
    // Every file is on the include list, or one the export writes itself.
    for (const f of files) expect(listed(f) || WRITTEN.includes(f), f).toBe(true);
    for (const f of ["src/worker.ts", "deploy/cloudflare/guide.md", "deploy/cloudflare/setup.ts", "scripts/smoke.mjs", "test/deploy/setup.test.ts",
      "docs/settings.md", "docs/development.md", "docs/security-material/constructs.md", "README.md", "package.json", "package-lock.json", ...WRITTEN]) {
      expect(files, f).toContain(f);
    }
    expect(files.filter((f) => f.startsWith("test/bench/") || f.startsWith("test/export/"))).toEqual([]);
    expect(INCLUDE.some((i) => i.startsWith(".sdlc") || i.startsWith("bench") || i.startsWith("release"))).toBe(false);
  });

  it("export_leaves_no_process_reference", () => {
    expect(checkTree(out)).toEqual([]);
    const pkg = JSON.parse(read(join(out, "package.json"))) as { scripts: Record<string, string>; version: string };
    for (const script of ["benchmark", "export", "deploy"]) expect(pkg.scripts, script).not.toHaveProperty(script);
    // The package and the Server's own `initialize` report one version.
    expect(pkg.version).toBe("0.2.0");
    expect(SERVER_INFO.version).toBe(pkg.version);
    expect(read(join(out, "tsconfig.json"))).not.toMatch(/bench|release/);
    expect(read(join(out, ".gitignore"))).not.toMatch(/bench/);
    expect(read(join(out, ".gitattributes"))).not.toMatch(/slices|deployment-trials/);
    expect(read(join(out, "LICENSE"))).toContain("Copyright (c) 2026 Prinsloo AI");
    // The check finds what it is for, in any text file whatever its extension, with its file and line.
    for (const [file, text] of [
      ["src/planted.ts", "// fine\n// see D-077 and the system spec's operations.md\n"],
      ["scripts/planted.sh", "echo fine\n# a later slice adds this\n"],
      ["docs/planted.notes.txt", "fine\nfound in the second code review\n"],
      ["test/planted.ts", "// fine\n// Gate 2: aggregates\n"],
      ["test/planted-2.ts", "// fine\n// Gate-2, and Gates 1 and 2\n"],
      ["test/planted-3.ts", "// fine\n// from the amendment gate\n"],
      ["test/planted-4.ts", "// fine\n// the critique found it\n"],
      ["test/planted-5.ts", "// fine\n// added per-slice\n"],
      ["test/planted-7.ts", "// fine\n// while slicing the backlog\n"],
      ["docs/planted-6.md", "fine\nsee spec.md, pipeline.json and Contract.md\n"],
    ] as const) {
      writeFileSync(join(out, file), text);
      try {
        expect(checkTree(out), file).toEqual([expect.stringMatching(new RegExp(`^${file.replaceAll(".", "\\.")}:2: `))]);
      } finally {
        rmSync(join(out, file));
      }
    }
    // Code that only looks like a process word passes: a `.slice(` call, a package named slice-ansi.
    writeFileSync(join(out, "src", "planted.ts"), 'const a = b.slice(0, 2);\n"node_modules/slice-ansi": {}\n');
    try {
      expect(checkTree(out)).toEqual([]);
    } finally {
      rmSync(join(out, "src", "planted.ts"));
    }
    // The copy's own .dev.vars.example is checked like any other file; only local secrets are not.
    const example = join(out, ".dev.vars.example");
    const exampleText = read(example);
    writeFileSync(example, `${exampleText}# see D-077\n`);
    try {
      expect(checkTree(out)).toEqual([expect.stringMatching(/^\.dev\.vars\.example:\d+: # see D-077$/)]);
    } finally {
      writeFileSync(example, exampleText);
    }
    // Every local secret file a re-export keeps is ignored, and the copy's example is not.
    expect(read(join(out, ".gitignore")).split("\n")).toEqual(expect.arrayContaining([".dev.vars*", "!.dev.vars.example", ".env*"]));
    // A binary file, marked by a NUL byte, holds no prose and is not read.
    writeFileSync(join(out, "docs", "planted.bin"), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from("\nD-077\n")]));
    try {
      expect(checkTree(out)).toEqual([]);
    } finally {
      rmSync(join(out, "docs", "planted.bin"));
    }
  });

  it("export_strips_project_identifiers", () => {
    const wrangler = read(join(out, "wrangler.jsonc"));
    expect(wrangler).not.toMatch(/IDP_ISSUER|IDP_CLIENT_ID|BOUNDARY/);
    expect(wrangler).toContain('"id": "00000000000000000000000000000000"');
    const planted = join(out, "docs", "planted.md");
    for (const id of ["9416b60e-03b2-44ee-84ff-5d25e16cf730", "sql-mcp-server.prinsloopower.workers.dev", "another.prinsloopower.workers.dev", "eb6eadef54d546ae84c12c419a4c2d9f", "dwsikgvekndbmowzdcnx"]) {
      writeFileSync(planted, `a line\n${id}\n`);
      try {
        expect(checkTree(out), id).toEqual([expect.stringMatching(/^docs\/planted\.md:2: /)]);
      } finally {
        rmSync(planted);
      }
    }
  });

  it("export_replaces_only_an_earlier_copy", () => {
    // Each condition refuses on its own, and the refused folder is left alone. A copy needs the
    // Server and its kit; even with both, this folder's own process, a clone's .git, or the
    // export's release/ refuse it, so an export can never empty the source or a clone.
    const fixture = (name: string, files: string[]) => {
      const dir = join(parent, name);
      for (const f of files) {
        mkdirSync(join(dir, f, ".."), { recursive: true });
        writeFileSync(join(dir, f), "x");
      }
      return dir;
    };
    const server = ["src/worker.ts", "deploy/cloudflare/guide.md"];
    for (const [name, files] of [
      ["no-server", ["LICENSE", "README.md"]],
      ["has-sdlc", [...server, ".sdlc/state.json"]],
      ["has-git", [...server, ".git/HEAD"]],
      ["has-release", [...server, "release/export.ts"]],
      ["has-bench", [...server, "bench/run.ts"]],
    ] as const) {
      const dir = fixture(name, [...files]);
      const before = listTree(dir);
      expect(() => exportTree(process.cwd(), dir), name).toThrow(/is not an earlier clean copy/);
      expect(listTree(dir), name).toEqual(before);
    }

    // A re-export keeps installed packages and a tried copy's local secrets, state and Operator file.
    const kept = {
      "node_modules/x.js": "x",
      ".dev.vars": "SERVER_SECRET=s",
      ".dev.vars.staging": "SERVER_SECRET=t",
      ".env": "A=1",
      ".wrangler/state": "w",
      "wrangler.trial.jsonc": "{}",
    };
    for (const [f, text] of Object.entries(kept)) {
      mkdirSync(join(out, f, ".."), { recursive: true });
      writeFileSync(join(out, f), text);
    }
    writeFileSync(join(out, "stale.md"), "from an older export");
    exportTree(process.cwd(), out);
    for (const [f, text] of Object.entries(kept)) expect(read(join(out, f)), f).toBe(text);
    expect(existsSync(join(out, "stale.md"))).toBe(false);

    // A copy the check refuses never reaches the target, and leaves no staging folder behind.
    const before = listTree(out).map((f) => `${f}:${read(join(out, f)).length}`);
    const staging = () => readdirSync(tmpdir()).filter((n) => n.startsWith("sql-mcp-export-")).length;
    const stagingBefore = staging();
    expect(() => exportTree(process.cwd(), out, [...INCLUDE, "docs/slices/S-005/spec.md"])).toThrow(/was refused, and .* was left as it was/s);
    expect(listTree(out).map((f) => `${f}:${read(join(out, f)).length}`)).toEqual(before);
    expect(staging()).toBe(stagingBefore);
  });

  it("export_swap_puts_back_on_failure", () => {
    // A target holding an earlier copy's a, b and c and a kept .dev.vars, and a staged copy with the
    // same names, as a real re-export has, plus a new d.
    const fresh = () => {
      const dir = mkdtempSync(join(parent, "swap-"));
      const to = join(dir, "copy");
      const staging = join(dir, "staging");
      for (const [f, text] of [["a.txt", "old a"], ["b/inner.txt", "old b"], ["c.txt", "old c"], [".dev.vars", "secret"]]) {
        mkdirSync(join(to, f!, ".."), { recursive: true });
        writeFileSync(join(to, f!), text!);
      }
      for (const f of ["a.txt", "b/inner.txt", "c.txt", "d.txt"]) {
        mkdirSync(join(staging, f, ".."), { recursive: true });
        writeFileSync(join(staging, f), "new");
      }
      return { dir, to, staging, before: state(to) };
    };
    const state = (to: string) => listTree(to).map((f) => `${f}=${read(join(to, f))}`);
    const aside = (dir: string) => readdirSync(dir).filter((n) => n.startsWith("copy.previous-"));
    const real = { renameSync, cpSync, rmSync };

    // An old entry cannot be moved aside (it is in use): the ones moved come straight back, and the
    // target is as it was, the kept .dev.vars included. Nothing is left aside.
    const inUse = fresh();
    let renames = 0;
    const lockSecond = { ...real, renameSync: ((a: string, b: string) => (++renames === 2 ? fail("EBUSY: b is locked") : renameSync(a, b))) as typeof renameSync };
    expect(() => swapInto(inUse.staging, inUse.to, lockSecond)).toThrow(/is in use, so the clean copy was not written and .* was left as it was: EBUSY/s);
    expect(state(inUse.to)).toEqual(inUse.before);
    expect(aside(inUse.dir)).toEqual([]);

    // Moving one back fails as well: the error names it, with its cause, and where it still is.
    const stuck = fresh();
    let moves = 0;
    const lockSecondAndBack = {
      ...real,
      renameSync: ((a: string, b: string) => {
        moves++;
        if (moves === 2) fail("EBUSY: b is locked");
        if (a.includes(".previous-")) fail("EPERM: a is held");
        return renameSync(a, b);
      }) as typeof renameSync,
    };
    expect(() => swapInto(stuck.staging, stuck.to, lockSecondAndBack)).toThrow(/still in .*copy\.previous-.*; move them back: a\.txt \(EPERM: a is held\)/s);
    const [held] = aside(stuck.dir);
    expect(readdirSync(join(stuck.dir, held!))).toEqual(["a.txt"]);

    // The new copy cannot be fully written: nothing is undone, and the error says where the old one is.
    const partial = fresh();
    const failCopy = { ...real, cpSync: ((_f: string, to: string) => { writeFileSync(join(to, "a.txt"), "new"); fail("ENOSPC: disk full"); }) as typeof cpSync };
    expect(() => swapInto(partial.staging, partial.to, failCopy)).toThrow(/only partly written .*ENOSPC.*The previous copy is in .*copy\.previous-/s);
    const [previous] = aside(partial.dir);
    expect(readdirSync(join(partial.dir, previous!)).sort()).toEqual(["a.txt", "b", "c.txt"]);

    // Nothing failing: the new copy replaces the old, the kept file stays, and nothing is left aside.
    const ok = fresh();
    swapInto(ok.staging, ok.to);
    expect(state(ok.to)).toEqual(["a.txt=new", "b/inner.txt=new", "c.txt=new", "d.txt=new"]);
    expect(read(join(ok.to, ".dev.vars"))).toBe("secret");
    expect(aside(ok.dir)).toEqual([]);
  });

  it("export_keeps_exactly_what_it_ignores", () => {
    // Real git decides what the copy's .gitignore ignores; the export must keep exactly those names.
    const repo = mkdtempSync(join(parent, "ignore-"));
    execFileSync("git", ["init", "-q"], { cwd: repo });
    writeFileSync(join(repo, ".gitignore"), read(join(out, ".gitignore")));
    const dirs = ["node_modules", ".wrangler", "dist", "src"];
    const files = [".dev.vars", ".dev.vars.staging", ".dev.vars.prod.bak", ".dev.vars.example", ".env", ".env.production.local", ".envrc", ".env.example",
      "wrangler.trial.jsonc", "wrangler.a.b.jsonc", "wrangler.jsonc", "package.json", "README.md", "LICENSE"];
    // Git lists no empty folder, so each holds a file.
    for (const d of dirs) {
      mkdirSync(join(repo, d), { recursive: true });
      writeFileSync(join(repo, d, "x"), "x");
    }
    for (const f of files) writeFileSync(join(repo, f), "x");
    // `git status --ignored`, not `check-ignore`, which reports a path a negated pattern matches as matched.
    const status = execFileSync("git", ["status", "--porcelain", "--ignored", "--untracked-files=normal"], { cwd: repo, encoding: "utf8" }).split("\n");
    const ignored = (name: string) => status.some((l) => l === `!! ${name}` || l === `!! ${name}/`);
    for (const name of [...dirs, ...files]) expect(keep(name), name).toBe(ignored(name));
    // The kit's own Operator files are among them, and the copy's own example and config are not.
    for (const worker of ["trial", "sql-mcp-trial"]) expect(keep(`wrangler.${worker}.jsonc`) && OPERATOR_FILE.test(`wrangler.${worker}.jsonc`)).toBe(true);
    for (const own of [".dev.vars.example", "wrangler.jsonc", "package.json"]) expect(keep(own), own).toBe(false);
  });

  it("guide_clones_the_clean_copy", () => {
    const guide = read(join(out, "deploy", "cloudflare", "guide.md"));
    expect(guide).toMatch(/^git clone https:\/\/github\.com\/prinsloopower\/prinsloo-ai\.git$/m);
    expect(guide).toMatch(/^cd prinsloo-ai\/mcp\/sql-mcp$/m);
  });

  it("settings_reference_matches_system_spec", () => {
    const settings = read("docs/settings.md");
    // Variables: the same names, each as secret or not as the spec has it. Purpose, example and
    // source are reworded for this release's one Host, Cloudflare.
    const variables = (text: string) => table(text, "## Variables").map((r) => [r[0], r[3]]);
    expect(variables(settings)).toEqual(variables(read("docs/system-spec/environments.md")));
    // Limits: each the spec's value and breach, without citations. Statement execution names only
    // Cloudflare's limits, so its breach alone is compared. The write tiers' limits, and the Worker
    // bundle's, which is a build check, belong to the spec only.
    const spec = new Map(table(read("docs/system-spec/operations.md"), "## Limits").map((r) => [r[0], r]));
    const limits = table(settings, "## Limits");
    expect(limits.map((r) => r[0])).toEqual([...spec.keys()].filter((k) => !/Typed tool|Conversation token|Worker bundle/.test(k!)));
    for (const [name, value, breach] of limits) {
      const s = spec.get(name)!;
      if (name !== "Statement execution") expect(value, name).toBe(uncited(s[1]!));
      expect(breach, name).toBe(uncited(s[2]!));
    }
    // Monitoring: the same signals and thresholds. Sources are worded for Cloudflare.
    const signals = (text: string) => table(text, "## Monitoring").map((r) => [r[0], r[2]]);
    expect(signals(settings)).toEqual(signals(read("docs/system-spec/operations.md")));
  });

  it("constructs_reference_matches_system_spec", () => {
    const pg = (rows: string[][]) => rows.map((r) => [r[0], r[1]]);
    expect(pg(table(read("docs/security-material/constructs.md"), "| | PostgreSQL"))).toEqual(
      pg(table(read("docs/system-spec/security.md"), "### Query check: supported constructs")),
    );
  });
});
