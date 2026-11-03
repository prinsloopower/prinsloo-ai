/**
 * The benchmark command (S-004): `npm run benchmark -- <deployment-url> [--runs N]`.
 * Needs ANTHROPIC_API_KEY in the environment, and a browser for the first Sign-in.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { EFFORT, MODEL, type Model, SYSTEM_PROMPT, exitCodeFor, runBenchmark } from "./src/harness.js";
import type { Question } from "./src/reference.js";
import { buildReport, credentialsInUse, writeReport } from "./src/report.js";
import { signedInServer } from "./src/server.js";
import { listenOnLoopback, openSystemBrowser } from "./src/signin.js";

const CACHE = "bench/.signin.json";

function usage(message: string): never {
  console.error(`${message}\nUsage: npm run benchmark -- <deployment-url> [--runs N]`);
  process.exit(2);
}

const args = process.argv.slice(2);
const url = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--runs");
if (!url) usage("No Deployment URL given.");
const deploymentUrl = new URL(url).origin;
const runsAt = args.indexOf("--runs");
const runs = runsAt >= 0 ? Number(args[runsAt + 1]) : 1;
if (!Number.isInteger(runs) || runs < 1) usage("--runs takes a whole number of at least 1.");

try {
  const questionFile = readFileSync("bench/questions.json");
  const questions = JSON.parse(questionFile.toString("utf8")) as Question[];
  const anthropic = new Anthropic();

  // One browser Sign-in at most, at the start; renewals mid-run use the cached Refresh token only (D-098).
  const issued: string[] = [];
  const server = await signedInServer(deploymentUrl, { fetch, openBrowser: openSystemBrowser, listen: listenOnLoopback, cachePath: CACHE }, Date.now, issued);
  console.log(`Signed in to ${server.name} ${server.version} at ${deploymentUrl}. ${questions.length} Questions, ${runs} run(s).`);

  const model: Model = (params) => anthropic.messages.stream(params).finalMessage();
  const startedAt = new Date().toISOString();
  let done = 0;
  const result = await runBenchmark({
    questions,
    runs,
    server,
    model: async (params) => {
      const reply = await model(params);
      if (reply.content.every((b) => b.type !== "tool_use")) console.log(`  ${++done}/${questions.length * runs} answered`);
      return reply;
    },
  });
  await server.close();

  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "bench", "src"], { encoding: "utf8" }).trim() !== "";
  const report = buildReport(
    {
      deploymentUrl,
      server: { name: server.name, version: server.version },
      model: MODEL,
      effort: EFFORT,
      systemPrompt: SYSTEM_PROMPT,
      harnessCommit: dirty ? `${commit} with uncommitted changes` : commit,
      questionSetSha256: createHash("sha256").update(questionFile).digest("hex"),
      runs,
      startedAt,
    },
    result,
    [...credentialsInUse(process.env, CACHE), ...issued].filter(Boolean),
  );
  const paths = writeReport("bench/reports", report);
  for (const [i, r] of report.results.entries()) {
    console.log(`Run ${i + 1}: ${(r.totals.correctness * 100).toFixed(1)}% correct, ${(r.totals.giveUp * 100).toFixed(1)}% given up.`);
  }
  if (report.stopped) console.log(`Stopped early (${report.stopped}).`);
  process.exitCode = exitCodeFor(result.stoppedBy);
  console.log(`About US$${report.costUsd.toFixed(2)}. Report: ${paths.md}`);
} catch (e) {
  console.error(`The benchmark could not run: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
