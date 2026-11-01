import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type OperatorConfig, mergeConfig, parseJsonc, template } from "../../deploy/cloudflare/lib/config.js";
import { setup } from "../../deploy/cloudflare/lib/setup.js";
import { wranglerRunner } from "../../deploy/cloudflare/lib/wrangler.js";
import { TRIAL, operatorFile, world } from "./world.js";

const SHARED = ["main", "compatibility_date", "compatibility_flags", "define", "observability", "version_metadata"];

describe("S-005 the shared config", () => {
  it("setup_deploy_merges_current_template", async () => {
    const w = world(TRIAL);
    await setup("setup", w.deps);
    // The Operator's file holds only their part, so a later template change reaches every deploy.
    const own = parseJsonc(w.files.get(operatorFile())!) as Record<string, unknown>;
    for (const key of SHARED) expect(own).not.toHaveProperty(key);

    // A hand edit to the Operator's file, then a deploy.
    own.vars = { ...(own.vars as object), ROW_LIMIT: "100" };
    w.files.set(operatorFile(), JSON.stringify(own));
    await setup("deploy", w.deps);
    const deployed = w.deployed[1]!.config;
    const t = template();
    for (const key of SHARED) expect(deployed[key]).toEqual(t[key]);
    expect(deployed).toEqual(mergeConfig(t, own as OperatorConfig));
    expect((deployed.vars as Record<string, string>).ROW_LIMIT).toBe("100");
    expect((deployed.vars as Record<string, string>).ENGINE).toBe("postgres");
    expect([...w.files.keys()]).toEqual([operatorFile()]);
  });

  it("template_matches_project_config", () => {
    const project = parseJsonc(readFileSync("wrangler.jsonc", "utf8")) as Record<string, any>;
    const t = template();
    for (const key of SHARED) expect(t[key], key).toEqual(project[key]);
    expect(t.hyperdrive.map((h) => h.binding)).toEqual(project.hyperdrive.map((h: { binding: string }) => h.binding));
    expect(t.vars.ENGINE).toBe(project.vars.ENGINE);
  });

  it("setup_config_passes_wrangler_dry_run", async () => {
    const config = mergeConfig(template(), {
      name: "sql-mcp-dry-run",
      account_id: "0123456789abcdef0123456789abcdef",
      hyperdrive_id: "0123456789abcdef0123456789abcdef",
      database_account: "sqlmcp_reader",
      vars: { ROW_LIMIT: "500", BOUNDARY: '{"schemas":["sales"]}' },
    });
    // At the package root, where setup writes it, so `main` resolves as it does for an Operator.
    const path = "wrangler.sql-mcp-dry-run.deploy.jsonc";
    const out = mkdtempSync(join(tmpdir(), "s005-dry-run-"));
    writeFileSync(path, JSON.stringify(config));
    try {
      const run = wranglerRunner(process.cwd(), spawn);
      const r = await run(["deploy", "--dry-run", "-c", path, "--outdir", out]);
      expect(r.code, r.stderr + r.stdout).toBe(0);
      expect(r.stdout).toMatch(/HYPERDRIVE/);
      expect(r.stdout).toMatch(/VERSION_METADATA/);
    } finally {
      rmSync(path, { force: true });
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
