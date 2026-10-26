import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Outcome, QuestionResult } from "../../bench/src/harness.js";
import { type ReportMeta, buildReport, reportMarkdown, writeReport } from "../../bench/src/report.js";

const META: ReportMeta = {
  deploymentUrl: "https://sql-mcp-server.example.workers.dev",
  server: { name: "sql-mcp-server", version: "0.0.1+4dc70716-52c2-411c-8fc8-1b65af40d0ff" },
  model: "claude-sonnet-5-5",
  effort: "high",
  systemPrompt: "You answer a Staff member's question.",
  harnessCommit: "3ae637c",
  questionSetSha256: "a".repeat(64),
  runs: 2,
  startedAt: "2026-10-25T20:15:07.000Z",
};

const row = (n: number, outcome: Outcome, extra: Partial<QuestionResult> = {}): QuestionResult => ({
  id: `B-${String(n).padStart(2, "0")}`,
  outcome,
  given: outcome === "correct" ? "12" : null,
  expected: { type: "integer", value: 12 },
  queries: 2,
  listTables: 1,
  refusedQueries: 0,
  refusals: [],
  tokens: { input: 1000, output: 200, cacheRead: 5000, cacheWrite: 300 },
  durationMs: 1500,
  ...extra,
});

/** A run of 40 Questions: the first `correct` correct, then `givenUp` given up, the rest incorrect. */
const run = (correct: number, givenUp: number) =>
  Array.from({ length: 40 }, (_, i) => row(i + 1, i < correct ? "correct" : i < correct + givenUp ? "given up" : "incorrect"));

describe("S-004 the run report", () => {
  it("report_totals_spread_and_metadata", () => {
    const report = buildReport(META, { runs: [run(30, 2), run(36, 0)], stopped: null });
    expect(report.results.map((r) => r.totals)).toEqual([
      { correct: 30, incorrect: 8, givenUp: 2, error: 0, notReached: 0, correctness: 0.75, giveUp: 0.05 },
      { correct: 36, incorrect: 4, givenUp: 0, error: 0, notReached: 0, correctness: 0.9, giveUp: 0 },
    ]);
    expect(report.spread!.correctness.mean).toBeCloseTo(0.825);
    expect(report.spread).toMatchObject({ correctness: { min: 0.75, max: 0.9 }, giveUp: { min: 0, max: 0.05 } });
    expect(report.spread!.giveUp.mean).toBeCloseTo(0.025);
    expect(report.tokens).toEqual({ input: 80_000, output: 16_000, cacheRead: 400_000, cacheWrite: 24_000 });
    // $2 a million input, $2.50 cache writes, $0.20 cache reads, $10 output (Claude Sonnet 5.5).
    expect(report.costUsd).toBeCloseTo((80_000 * 2 + 24_000 * 2.5 + 400_000 * 0.2 + 16_000 * 10) / 1e6, 6);
    expect(report).toMatchObject({ ...META, stopped: null });

    const md = reportMarkdown(report);
    for (const s of [META.deploymentUrl, META.server.version, META.model, META.harnessCommit, META.questionSetSha256, "75.0%", "90.0%", "82.5%", "5.0%"]) {
      expect(md).toContain(s);
    }

    const single = buildReport({ ...META, runs: 1 }, { runs: [run(30, 2)], stopped: null });
    expect(single.spread).toBeNull();
  });

  it("report_lists_refusal_sentences", () => {
    const sentence = "The query was not accepted: qualify every table with its schema and every column with its table or alias.";
    const rows = run(38, 0);
    rows[38] = row(39, "given up", { refusedQueries: 3, refusals: [sentence, sentence, "The query was not accepted: it changes data."] });
    const report = buildReport({ ...META, runs: 1 }, { runs: [rows], stopped: null });
    expect(report.results[0]!.rows[38]!.refusals).toEqual([sentence, sentence, "The query was not accepted: it changes data."]);
    expect(JSON.stringify(report)).not.toContain("SELECT 12");
    const md = reportMarkdown(report);
    expect(md).toContain(`| 2 | ${sentence} |`);
    expect(md).toContain("| 1 | The query was not accepted: it changes data. |");
    expect(md).not.toContain("(reference");
  });

  it("report_paths_do_not_collide", () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-reports-"));
    const report = buildReport({ ...META, runs: 1 }, { runs: [run(40, 0)], stopped: null });
    const first = writeReport(dir, report);
    const second = writeReport(dir, report);
    const later = writeReport(dir, { ...report, startedAt: "2026-10-25T23:59:59.000Z" });
    expect(first.json).toMatch(/2026-10-25T20-15-07Z-claude-sonnet-5-5\.json$/);
    expect(new Set([first.json, second.json, later.json]).size).toBe(3);
    expect(new Set([first.md, second.md, later.md]).size).toBe(3);
    expect(readdirSync(dir)).toHaveLength(6);
    expect(JSON.parse(readFileSync(first.json, "utf8"))).toEqual(report);
  });

  it("report_holds_no_tokens_or_keys", () => {
    const secrets = ["sk-ant-api03-not-a-real-key", "eyJhbGciOiJIUzI1NiJ9.refresh.token", "eyJhbGciOiJIUzI1NiJ9.access.token"];
    const rows = run(39, 0);
    // An error's text can carry what a request was sent with; the report must not.
    rows[39] = row(40, "error", { error: `API failure: 401 invalid x-api-key ${secrets[0]} for bearer ${secrets[2]}` });
    const report = buildReport({ ...META, runs: 1 }, { runs: [rows], stopped: null }, secrets);
    const dir = mkdtempSync(join(tmpdir(), "bench-reports-"));
    const paths = writeReport(dir, report);
    for (const file of [paths.json, paths.md]) {
      const text = readFileSync(file, "utf8");
      for (const s of secrets) expect(text).not.toContain(s);
    }
    expect(report.results[0]!.rows[39]!.error).toBe("API failure: 401 invalid x-api-key [redacted] for bearer [redacted]");
  });
});
