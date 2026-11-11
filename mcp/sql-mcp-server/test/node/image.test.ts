import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { accountCheckSql } from "../../src/engine/mssql.js";

// Every build of dist/server.js is in this one file, because test files run in parallel.

/** The Dockerfile's instructions from its last FROM on, as [instruction, arguments]. */
function runtimeStage(): [string, string][] {
  const lines = readFileSync("Dockerfile", "utf8")
    .replace(/\\\r?\n/g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  let from = 0;
  lines.forEach((l, i) => {
    if (/^FROM\s/i.test(l)) from = i;
  });
  return lines.slice(from).map((l) => {
    const [instruction = "", ...rest] = l.split(/\s+/);
    return [instruction.toUpperCase(), rest.join(" ")];
  });
}

describe("the container image", () => {
  it("image_holds_only_the_bundle", () => {
    const stage = runtimeStage();
    expect(stage[0]).toEqual(["FROM", "node:24-slim"]);
    // The one project file copied in is the bundle, and nothing is installed beside it.
    expect(stage.filter(([i]) => i === "COPY" || i === "ADD")).toEqual([["COPY", "dist/server.js dist/server.js"]]);
    expect(stage.filter(([i, a]) => i === "RUN" && /\b(npm|npx|yarn|pnpm|corepack)\b/.test(a))).toEqual([]);
    // The build context holds nothing else either.
    expect(readFileSync(".dockerignore", "utf8").split(/\r?\n/).filter(Boolean)).toEqual(["*", "!dist/server.js"]);
  });

  it("image_runs_as_non_root", () => {
    const users = runtimeStage()
      .filter(([i]) => i === "USER")
      .map(([, a]) => a);
    // node:24-slim's node user is uid 1000.
    expect(users.at(-1)).toBe("node");
  });

  it("image_packages_declared", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(["mssql", "@hono/node-server", "undici"]));
    expect(Object.keys(pkg.devDependencies)).toContain("esbuild");
  });
});

describe("the image's bundle", () => {
  beforeAll(() => {
    execSync("npm run build:image", { stdio: "pipe" });
  }, 60_000);

  it("image_bundle_excludes_postgres_and_wrangler", () => {
    const meta = JSON.parse(readFileSync("dist/server.meta.json", "utf8")) as { inputs: Record<string, unknown> };
    const inputs = Object.keys(meta.inputs);
    expect(inputs).toContain("src/server.ts");
    const excluded = /(^|\/)node_modules\/(pg[^/]*|@libpg-query\/[^/]+|wrangler|miniflare|@cloudflare\/[^/]+)\//;
    expect(inputs.filter((p) => excluded.test(p) || p === "src/engine/postgres.ts")).toEqual([]);
  });
});

describe("the account check the bundle prints", () => {
  it("check_sql_printed_matches_bundle", () => {
    execSync("npm run build:image", { stdio: "pipe" });
    const printed = spawnSync(process.execPath, ["dist/server.js", "--print-check-sql"], { encoding: "utf8", env: {} });
    // Printed with no settings, and nothing but the Azure SQL Database statement.
    expect(printed.status).toBe(0);
    expect(printed.stderr).toBe("");
    expect(printed.stdout).toBe(`${accountCheckSql(true)}\n`);
  }, 60_000);
});
