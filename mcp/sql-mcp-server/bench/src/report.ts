import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Outcome, QuestionResult } from "./harness.js";

/** What a rerun needs (S-004 spec, The run report). */
export type ReportMeta = {
  deploymentUrl: string;
  /** From `initialize`; the version names the deployed Worker version. */
  server: { name: string; version: string };
  model: string;
  effort: string;
  systemPrompt: string;
  harnessCommit: string;
  questionSetSha256: string;
  runs: number;
  startedAt: string;
};

type Totals = { correct: number; incorrect: number; givenUp: number; error: number; notReached: number; correctness: number; giveUp: number };
type Spread = { mean: number; min: number; max: number };
export type Report = ReportMeta & {
  results: { totals: Totals; rows: QuestionResult[] }[];
  /** Across runs, when more than one was asked for. */
  spread: { correctness: Spread; giveUp: Spread } | null;
  tokens: QuestionResult["tokens"];
  costUsd: number;
  stopped: string | null;
};

/** Claude Sonnet 5.5's prices in US dollars per million tokens; cache writes are five-minute writes. */
const PRICE = { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 };

/** The report of an invocation, with every occurrence of each of `secrets` replaced, wherever it came from. */
export function buildReport(meta: ReportMeta, result: { runs: QuestionResult[][]; stopped: string | null }, secrets: string[] = []): Report {
  const results = result.runs.map((rows) => ({ totals: totals(rows), rows }));
  const all = result.runs.flat();
  const tokens = {
    input: sum(all, (r) => r.tokens.input),
    output: sum(all, (r) => r.tokens.output),
    cacheRead: sum(all, (r) => r.tokens.cacheRead),
    cacheWrite: sum(all, (r) => r.tokens.cacheWrite),
  };
  const report: Report = {
    ...meta,
    results,
    spread:
      results.length > 1
        ? { correctness: spread(results.map((r) => r.totals.correctness)), giveUp: spread(results.map((r) => r.totals.giveUp)) }
        : null,
    tokens,
    costUsd:
      (tokens.input * PRICE.input + tokens.cacheWrite * PRICE.cacheWrite + tokens.cacheRead * PRICE.cacheRead + tokens.output * PRICE.output) /
      1e6,
    stopped: result.stopped,
  };
  return redact(report, secrets.filter((s) => s.length > 0));
}

function totals(rows: QuestionResult[]): Totals {
  const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
  const t = { correct: count("correct"), incorrect: count("incorrect"), givenUp: count("given up"), error: count("error"), notReached: count("not reached") };
  return { ...t, correctness: t.correct / rows.length, giveUp: t.givenUp / rows.length };
}

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const spread = (xs: number[]): Spread => ({ mean: sum(xs, (x) => x) / xs.length, min: Math.min(...xs), max: Math.max(...xs) });

function redact<T>(value: T, secrets: string[]): T {
  if (secrets.length === 0) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return secrets.reduce((s, secret) => s.split(secret).join("[redacted]"), v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const shown = (e: QuestionResult["expected"]) => {
  switch (e.type) {
    case "unavailable":
      return "UNAVAILABLE";
    case "list":
      return e.value.join(", ");
    case "map":
      return Object.entries(e.value).map(([k, v]) => `${k}=${v}`).join(", ");
    default:
      return String(e.value);
  }
};

/** The same report as a summary and tables, for reading on GitHub. */
export function reportMarkdown(report: Report): string {
  const lines = [
    `# Benchmark run — ${report.startedAt}`,
    "",
    `- Deployment: ${report.deploymentUrl}`,
    `- Server: ${report.server.name} ${report.server.version}`,
    `- Model: ${report.model}, effort ${report.effort}`,
    `- Harness commit: ${report.harnessCommit}`,
    `- Question set SHA-256: ${report.questionSetSha256}`,
    `- Runs: ${report.runs}`,
    `- Tokens: ${report.tokens.input} input, ${report.tokens.cacheWrite} cache write, ${report.tokens.cacheRead} cache read, ${report.tokens.output} output`,
    `- Approximate cost: US$${report.costUsd.toFixed(2)}`,
    ...(report.stopped ? [`- Stopped early at ${report.stopped}; the Questions not reached are marked so.`] : []),
    "",
    "## Summary",
    "",
    "| run | correct | incorrect | given up | error | not reached | correctness | give-up |",
    "|---|---|---|---|---|---|---|---|",
    ...report.results.map(
      ({ totals: t }, i) =>
        `| ${i + 1} | ${t.correct} | ${t.incorrect} | ${t.givenUp} | ${t.error} | ${t.notReached} | ${pct(t.correctness)} | ${pct(t.giveUp)} |`,
    ),
    ...(report.spread
      ? [
          "",
          `Correctness: mean ${pct(report.spread.correctness.mean)}, min ${pct(report.spread.correctness.min)}, max ${pct(report.spread.correctness.max)}.`,
          `Give-up: mean ${pct(report.spread.giveUp.mean)}, min ${pct(report.spread.giveUp.min)}, max ${pct(report.spread.giveUp.max)}.`,
        ]
      : []),
  ];

  const refusals = new Map<string, number>();
  for (const r of report.results.flatMap((x) => x.rows)) for (const s of r.refusals) refusals.set(s, (refusals.get(s) ?? 0) + 1);
  lines.push("", "## Refusals", "");
  if (refusals.size === 0) lines.push("None.");
  else {
    lines.push("| count | sentence |", "|---|---|");
    for (const [s, n] of [...refusals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) lines.push(`| ${n} | ${cell(s)} |`);
  }

  report.results.forEach(({ rows }, i) => {
    lines.push("", `## Run ${i + 1}`, "", "| Question | outcome | given | expected | queries | list_tables | refused | input | cache read | output | seconds |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of rows) {
      const outcome = r.error ? `${r.outcome}: ${r.error}` : r.outcome;
      lines.push(
        `| ${r.id} | ${cell(outcome)} | ${cell(r.given ?? "")} | ${cell(shown(r.expected))} | ${r.queries} | ${r.listTables} | ${r.refusedQueries} | ${r.tokens.input} | ${r.tokens.cacheRead} | ${r.tokens.output} | ${(r.durationMs / 1000).toFixed(1)} |`,
      );
    }
  });
  return lines.join("\n") + "\n";
}

/** Writes `<UTC date and time>-<model>.json` and `.md` into `dir`, never over an earlier report. */
export function writeReport(dir: string, report: Report): { json: string; md: string } {
  mkdirSync(dir, { recursive: true });
  const stem = `${report.startedAt.replace(/\.\d+Z$/, "Z").replace(/:/g, "-")}-${report.model}`;
  let name = stem;
  for (let n = 2; existsSync(join(dir, `${name}.json`)) || existsSync(join(dir, `${name}.md`)); n++) name = `${stem}-${n}`;
  const paths = { json: join(dir, `${name}.json`), md: join(dir, `${name}.md`) };
  writeFileSync(paths.json, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(paths.md, reportMarkdown(report));
  return paths;
}
