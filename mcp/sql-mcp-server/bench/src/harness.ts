import type Anthropic from "@anthropic-ai/sdk";
import { judge } from "./judge.js";
import { LIST_TABLES } from "../../src/tools/list-tables.js";
import { QUERY } from "../../src/tools/query.js";
import type { Question } from "./reference.js";

export const MODEL = "claude-sonnet-5-5";
export const EFFORT = "high";

/** Sent exactly as written, with its backticks (S-004 spec, Interface). */
export const SYSTEM_PROMPT =
  "You answer a Staff member's question about their organisation's data, using the tools you have. When you have the answer, end your reply with one line of the form `ANSWER: <value>`. For a number, give the number alone, with no units, no thousands separators and no percent sign, and with at least two decimal places unless it is a whole count. Do not round any intermediate value. For several values, separate them with commas. For values by group, write `name=value` pairs separated by commas. If the data needed is not available to you, write `ANSWER: UNAVAILABLE`.";

/** When a Question, and an invocation, end (D-042, D-093). */
const REFUSED_QUERIES = 3;
const TURNS = 20;
const QUESTION_INPUT_TOKENS = 400_000;
const RUN_INPUT_TOKENS = 8_000_000;

/** A refused query's result starts with this; a Database error or an input refusal does not (D-082). */
export const REFUSED_QUERY = "The query was not accepted";

/**
 * Thrown by the Server when the invocation cannot go on: its Sign-in could not be renewed (D-098).
 * The Question in hand ends as an error with what it spent, and the rest are not reached.
 */
export class InvocationStopped extends Error {}

/** What cut an invocation short: its token ceiling, or a Sign-in that could not be renewed. */
export type StoppedBy = "ceiling" | "signin" | null;

/** A run cut short by its Sign-in did not complete, so the command exits 1; the ceiling is a cap it is allowed to meet. */
export function exitCodeFor(stoppedBy: StoppedBy): 0 | 1 {
  return stoppedBy === "signin" ? 1 : 0;
}

export type ServerResult = { content: { type: string; text?: string }[]; isError?: boolean };
/** The deployed Server as the harness reaches it: its `initialize` name and version, `tools/list`, and `tools/call`. */
export type Server = {
  name: string;
  version: string;
  tools: { name: string; description?: string; inputSchema: Record<string, unknown> }[];
  call(name: string, input: unknown): Promise<ServerResult>;
};
export type Model = (params: Anthropic.Messages.MessageCreateParamsNonStreaming) => Promise<Anthropic.Messages.Message>;

export type Outcome = "correct" | "incorrect" | "given up" | "error" | "not reached";
export type QuestionResult = {
  id: string;
  outcome: Outcome;
  given: string | null;
  expected: Question["expected"];
  queries: number;
  listTables: number;
  refusedQueries: number;
  /** Each Refusal's sentence, without its " (reference …)" ending. */
  refusals: string[];
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  durationMs: number;
  error?: string;
};

/** Puts every Question to the model, `runs` times, through the Server's own tools. */
export async function runBenchmark(opts: { questions: Question[]; runs: number; model: Model; server: Server }) {
  const ceiling = RUN_INPUT_TOKENS * opts.runs;
  let spent = 0;
  let stopped: string | null = null;
  let stoppedBy: StoppedBy = null;
  const runs: QuestionResult[][] = [];
  for (let r = 0; r < opts.runs; r++) {
    const run: QuestionResult[] = [];
    for (const q of opts.questions) {
      if (stopped) {
        run.push({ ...empty(q), outcome: "not reached" });
        continue;
      }
      if (spent >= ceiling) {
        stopped = "8,000,000 input tokens per run";
        stoppedBy = "ceiling";
        run.push({ ...empty(q), outcome: "not reached" });
        continue;
      }
      const result = await runQuestion(q, opts.model, opts.server, (reason) => {
        stopped = reason;
        stoppedBy = "signin";
      });
      spent += inputTokens(result.tokens);
      run.push(result);
    }
    runs.push(run);
  }
  return { runs, stopped, stoppedBy };
}

async function runQuestion(q: Question, model: Model, server: Server, stop: (reason: string) => void): Promise<QuestionResult> {
  const started = Date.now();
  const result = empty(q);
  const end = (outcome: Outcome, error?: string) => ({
    ...result,
    outcome,
    ...(error ? { error } : {}),
    durationMs: Date.now() - started,
  });
  const tools = server.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) as Anthropic.Messages.Tool[];
  // Append-only, thinking blocks included, so each turn's prefix is the last turn's and caches.
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: q.text }];

  for (let turn = 1; turn <= TURNS; turn++) {
    let reply: Anthropic.Messages.Message;
    try {
      reply = await model({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        tools,
        tool_choice: { type: "auto" },
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT },
        cache_control: { type: "ephemeral" },
        messages: [...messages],
      });
    } catch (e) {
      return end("error", `API failure: ${e instanceof Error ? e.message : String(e)}`);
    }
    const u = reply.usage;
    result.tokens.input += u.input_tokens;
    result.tokens.output += u.output_tokens;
    result.tokens.cacheRead += u.cache_read_input_tokens ?? 0;
    result.tokens.cacheWrite += u.cache_creation_input_tokens ?? 0;
    messages.push({ role: "assistant", content: reply.content });

    // A refusal can cut a tool call off mid-input, so none of that turn's calls is made.
    if (reply.stop_reason === "refusal") return end("error", "model refusal");
    const uses = reply.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
    if (uses.length === 0) {
      const text = reply.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
      const judged = judge(text, q.expected);
      result.given = judged.given;
      return end(judged.correct ? "correct" : "incorrect");
    }
    if (reply.stop_reason === "max_tokens") return end("error", "max_tokens inside a tool call");

    const results: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const use of uses) {
      let answer: ServerResult;
      try {
        answer = await server.call(use.name, use.input);
      } catch (e) {
        if (e instanceof InvocationStopped) {
          stop(e.message);
          return end("error", e.message);
        }
        return end("error", `Server failure: ${e instanceof Error ? e.message : String(e)}`);
      }
      const text = answer.content.flatMap((c) => (c.type === "text" && c.text !== undefined ? [c.text] : []));
      if (use.name === LIST_TABLES) result.listTables++;
      if (use.name === QUERY) {
        result.queries++;
        const first = text[0] ?? "";
        if (first.startsWith(REFUSED_QUERY)) {
          result.refusedQueries++;
          result.refusals.push(first.replace(/ \(reference [^)]*\)$/, ""));
          if (result.refusedQueries >= REFUSED_QUERIES) return end("given up");
        }
      }
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: text.map((t) => ({ type: "text" as const, text: t })),
        is_error: answer.isError ?? false,
      });
    }
    if (inputTokens(result.tokens) >= QUESTION_INPUT_TOKENS) return end("error", "400,000 input tokens");
    messages.push({ role: "user", content: results });
  }
  return end("error", "20 model turns");
}

/** Input tokens as the caps count them: cache reads and writes included. */
function inputTokens(t: QuestionResult["tokens"]) {
  return t.input + t.cacheRead + t.cacheWrite;
}

function empty(q: Question): QuestionResult {
  return {
    id: q.id,
    outcome: "not reached",
    given: null,
    expected: q.expected,
    queries: 0,
    listTables: 0,
    refusedQueries: 0,
    refusals: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    durationMs: 0,
  };
}
