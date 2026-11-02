import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

/** The Workers paid plan's limit on a gzipped Worker. */
const LIMIT = 10 * 1024 * 1024;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("Worker bundle", () => {
  it("worker_bundle_under_10_mib_gzipped", () => {
    const out = mkdtempSync(join(tmpdir(), "sqlmcp-bundle-"));
    try {
      execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "deploy", "--dry-run", "--outdir", out], { stdio: "pipe" });
      const built = files(out);
      // The parser's WebAssembly is in the bundle the Worker actually deploys.
      expect(built.some((f) => f.endsWith(".wasm"))).toBe(true);
      const gzipped = built.reduce((sum, f) => sum + gzipSync(readFileSync(f)).length, 0);
      expect(gzipped).toBeLessThan(LIMIT);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
