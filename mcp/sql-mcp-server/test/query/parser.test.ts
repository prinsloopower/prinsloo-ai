import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev, type Unstable_DevWorker } from "wrangler";
import { ALL_CONSTRUCTS_SQL } from "./constructs.js";

describe("S-003 PostgreSQL parser in workerd", () => {
  let worker: Unstable_DevWorker;

  beforeAll(async () => {
    worker = await unstable_dev("test/parser-probe.worker.ts", {
      config: "test/parser-probe.wrangler.jsonc",
      experimental: { disableExperimentalWarning: true },
    });
  }, 60_000);

  afterAll(async () => {
    await worker?.stop();
  });

  it("query_parser_parses_and_normalises_in_workerd", async () => {
    const res = await worker.fetch("/", { method: "POST", body: ALL_CONSTRUCTS_SQL });
    expect(res.status).toBe(200);
    const { tree, normalized } = (await res.json()) as { tree: { stmts: { stmt: Record<string, unknown> }[] }; normalized: string };
    expect(tree.stmts).toHaveLength(1);
    expect(Object.keys(tree.stmts[0]!.stmt)).toEqual(["SelectStmt"]);
    // Every literal is replaced by a placeholder, and no string literal survives.
    expect(normalized).toContain("$1");
    expect(normalized).not.toMatch(/'[^']*'/);
  }, 30_000);
});
