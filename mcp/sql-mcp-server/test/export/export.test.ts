import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INCLUDE, WRITTEN, checkTree, exportTree, listTree, listed } from "../../release/export.js";
import { SERVER_INFO } from "../../src/mcp.js";
import { table } from "../markdown.js";

// This folder's own tests of the clean copy (D-111). The export leaves them out, with the
// benchmark's, because they read the pipeline's documents.

const read = (p: string) => readFileSync(p, "utf8");
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
    expect(pkg.version).toBe("0.1.0");
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
