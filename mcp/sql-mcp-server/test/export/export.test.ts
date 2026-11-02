import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkTree, exportTree, listTree } from "../../release/export.js";

// This folder's own tests of the clean copy (D-111). The export leaves them out, with the
// benchmark's, because they read the pipeline's documents.

const read = (p: string) => readFileSync(p, "utf8");
/** Rows of the first markdown table after `heading`, as cells. */
function table(text: string, heading: string): string[][] {
  const lines = text.slice(text.indexOf(heading)).split("\n");
  const start = lines.findIndex((l) => l.startsWith("|"));
  const end = lines.findIndex((l, i) => i > start && !l.startsWith("|"));
  return lines.slice(start + 2, end).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
}

let out: string;
beforeAll(() => {
  out = join(mkdtempSync(join(tmpdir(), "s005-export-")), "sql-mcp");
  // A failed export leaves `out` missing, so each test fails on its own assertions rather than being skipped.
  try {
    exportTree(process.cwd(), out);
  } catch {}
});
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("the clean copy's export", () => {
  it("export_includes_only_listed_files", () => {
    const files = listTree(out);
    for (const f of ["src/worker.ts", "deploy/cloudflare/guide.md", "deploy/cloudflare/setup.ts", "scripts/smoke.mjs", "test/deploy/setup.test.ts",
      "docs/settings.md", "docs/development.md", "docs/security-material/constructs.md", "README.md", "LICENSE", "package.json", "package-lock.json",
      "wrangler.jsonc", ".gitignore", ".gitattributes", ".dev.vars.example"]) {
      expect(files, f).toContain(f);
    }
    for (const f of files) {
      expect(f, f).not.toMatch(/^(\.sdlc|bench|inputs|release|test\/bench|test\/export|docs\/slices|docs\/system-spec|docs\/architecture|node_modules)\//);
      expect(f, f).not.toMatch(/^(docs\/(discovery|journeys|prd|domain-model|slices|deployment-trials)\.md|\.git-blame-ignore-revs)$/);
    }
    // Nothing the folder does not track: no installed packages, no local secrets, no Operator config.
    expect(files.some((f) => f.startsWith("node_modules/") || f === ".dev.vars" || /^wrangler\.[^/]+\.jsonc$/.test(f))).toBe(false);
  });

  it("export_leaves_no_process_reference", () => {
    expect(checkTree(out)).toEqual([]);
    const pkg = JSON.parse(read(join(out, "package.json"))) as { scripts: Record<string, string>; version: string };
    expect(pkg.scripts).not.toHaveProperty("benchmark");
    expect(pkg.scripts).not.toHaveProperty("export");
    expect(pkg.version).toBe("0.1.0");
    expect(read(join(out, "tsconfig.json"))).not.toMatch(/bench|release/);
    expect(read(join(out, ".gitignore"))).not.toMatch(/bench/);
    expect(read(join(out, ".gitattributes"))).not.toMatch(/slices|deployment-trials/);
    expect(read(join(out, "LICENSE"))).toContain("Copyright (c) 2026 Prinsloo AI");
    // The check finds what it is for: a planted reference fails it, with its file and line.
    const planted = join(out, "src", "planted.ts");
    writeFileSync(planted, "// fine\n// see D-077 and the system spec's operations.md\n");
    try {
      expect(checkTree(out)).toEqual([expect.stringMatching(/^src\/planted\.ts:2: /)]);
    } finally {
      rmSync(planted);
    }
  });

  it("export_strips_project_identifiers", () => {
    const wrangler = read(join(out, "wrangler.jsonc"));
    expect(wrangler).not.toMatch(/IDP_ISSUER|IDP_CLIENT_ID|BOUNDARY/);
    expect(wrangler).toContain('"id": "00000000000000000000000000000000"');
    const planted = join(out, "docs", "planted.md");
    for (const id of ["9416b60e-03b2-44ee-84ff-5d25e16cf730", "sql-mcp-server.prinsloopower.workers.dev", "eb6eadef54d546ae84c12c419a4c2d9f", "dwsikgvekndbmowzdcnx"]) {
      writeFileSync(planted, `a line\n${id}\n`);
      try {
        expect(checkTree(out), id).toEqual([expect.stringMatching(/^docs\/planted\.md:2: /)]);
      } finally {
        rmSync(planted);
      }
    }
  });

  it("settings_reference_matches_system_spec", () => {
    const settings = read("docs/settings.md");
    const names = (rows: string[][]) => rows.map((r) => r[0]);
    expect(names(table(settings, "## Variables"))).toEqual(names(table(read("docs/system-spec/environments.md"), "## Variables")));
    const signals = (rows: string[][]) => rows.map((r) => [r[0], r[2]]);
    expect(signals(table(settings, "## Monitoring"))).toEqual(signals(table(read("docs/system-spec/operations.md"), "## Monitoring")));
  });

  it("constructs_reference_matches_system_spec", () => {
    const pg = (rows: string[][]) => rows.map((r) => [r[0], r[1]]);
    expect(pg(table(read("docs/security-material/constructs.md"), "| | PostgreSQL"))).toEqual(
      pg(table(read("docs/system-spec/security.md"), "### Query check: supported constructs")),
    );
  });
});
