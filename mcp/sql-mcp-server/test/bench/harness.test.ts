import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { type Server, type ServerResult, SYSTEM_PROMPT, runBenchmark } from "../../bench/src/harness.js";
import type { Question } from "../../bench/src/reference.js";

type Params = Anthropic.Messages.MessageCreateParamsNonStreaming;
type Block = Anthropic.Messages.ContentBlock;

const TOOLS = [
  { name: "list_tables", description: "Lists the tables.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  {
    name: "query",
    description: "Runs one read-only SQL query.\n\nQualify every table.",
    inputSchema: { type: "object", properties: { sql: { type: "string" }, request_text: { type: "string" } }, required: ["sql", "request_text"] },
  },
];

const question = (id: string, value = 12): Question => ({
  id,
  text: `Question ${id}?`,
  type: "integer",
  expected: { type: "integer", value },
  sql: "SELECT 12",
});

let toolUseId = 0;
const toolUse = (name: string, input: Record<string, unknown> = {}): Block =>
  ({ type: "tool_use", id: `toolu_${++toolUseId}`, name, input, caller: { type: "direct" } }) as Block;
const text = (t: string): Block => ({ type: "text", text: t, citations: null }) as Block;

/** A model that answers each call from a script, and records what it was sent. */
function fakeModel(reply: (params: Params, call: number) => { content: Block[]; stop?: Anthropic.Messages.StopReason; input?: number; cacheRead?: number }) {
  const calls: Params[] = [];
  const model = async (params: Params) => {
    calls.push(structuredClone(params));
    const r = reply(params, calls.length);
    return {
      id: `msg_${calls.length}`,
      type: "message",
      role: "assistant",
      model: params.model,
      content: r.content,
      stop_reason: r.stop ?? (r.content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn"),
      stop_sequence: null,
      usage: { input_tokens: r.input ?? 1000, output_tokens: 100, cache_read_input_tokens: r.cacheRead ?? 0, cache_creation_input_tokens: 0 },
    } as unknown as Anthropic.Messages.Message;
  };
  return { model, calls };
}

/** A Server that answers each tool call from a script, and records what it was sent. */
function fakeServer(answer: (name: string, input: unknown, call: number) => ServerResult): Server & { received: [string, unknown][] } {
  const received: [string, unknown][] = [];
  return {
    name: "sql-mcp-server",
    version: "0.0.1+test",
    tools: TOOLS,
    received,
    call: async (name, input) => {
      received.push([name, structuredClone(input)]);
      return answer(name, input, received.length);
    },
  };
}

const ok = (t = "1 row"): ServerResult => ({ content: [{ type: "text", text: t }] });
const refused: ServerResult = {
  content: [{ type: "text", text: "The query was not accepted: it changes data. (reference 0f8e7a4c-1111-4000-8000-000000000000)" }],
  isError: true,
};

describe("S-004 the harness", () => {
  it("harness_offers_tools_from_tools_list", async () => {
    const { model, calls } = fakeModel(() => ({ content: [text("ANSWER: 12")] }));
    const report = await runBenchmark({ questions: [question("B-01")], runs: 1, model, server: fakeServer(() => ok()) });
    expect(calls).toHaveLength(1);
    const p = calls[0]!;
    expect(p.tools).toEqual(TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })));
    expect(p).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tool_choice: { type: "auto" },
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      messages: [{ role: "user", content: "Question B-01?" }],
    });
    expect(SYSTEM_PROMPT).toBe(
      "You answer a Staff member's question about their organisation's data, using the tools you have. When you have the answer, end your reply with one line of the form `ANSWER: <value>`. For a number, give the number alone, with no units, no thousands separators and no percent sign, and with at least two decimal places unless it is a whole count. Do not round any intermediate value. For several values, separate them with commas. For values by group, write `name=value` pairs separated by commas. If the data needed is not available to you, write `ANSWER: UNAVAILABLE`.",
    );
    expect(report.runs[0]![0]).toMatchObject({ id: "B-01", outcome: "correct", given: "12" });
  });

  it("harness_forwards_calls_and_results", async () => {
    const input = { sql: "SELECT count(*) FROM sqlmcp_test.customers c", request_text: "How many customers?" };
    const { model, calls } = fakeModel((_, n) =>
      n === 1 ? { content: [text("Let me look."), toolUse("list_tables"), toolUse("query", input)] } : { content: [text("ANSWER: 12")] },
    );
    const server = fakeServer((name) =>
      name === "list_tables" ? ok("sqlmcp_test.customers") : { content: [{ type: "text", text: "The database could not complete this." }], isError: true },
    );
    const report = await runBenchmark({ questions: [question("B-01")], runs: 1, model, server });
    expect(server.received).toEqual([["list_tables", {}], ["query", input]]);
    const [assistant, results] = calls[1]!.messages.slice(1);
    expect(assistant).toMatchObject({ role: "assistant" });
    expect((assistant!.content as Block[]).map((b) => b.type)).toEqual(["text", "tool_use", "tool_use"]);
    const uses = (assistant!.content as Block[]).filter((b) => b.type === "tool_use") as Anthropic.Messages.ToolUseBlock[];
    expect(results).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: uses[0]!.id, content: [{ type: "text", text: "sqlmcp_test.customers" }], is_error: false },
        { type: "tool_result", tool_use_id: uses[1]!.id, content: [{ type: "text", text: "The database could not complete this." }], is_error: true },
      ],
    });
    expect(report.runs[0]![0]).toMatchObject({ outcome: "correct", queries: 1, listTables: 1, refusedQueries: 0 });
  });

  it("harness_gives_up_after_three_refused_queries", async () => {
    const { model, calls } = fakeModel((_, n) => ({ content: [n === 1 ? toolUse("list_tables") : toolUse("query", { sql: `SELECT ${n}`, request_text: "q" })] }));
    const script: ServerResult[] = [
      // A list_tables result is never a refused query, whatever it says.
      { content: [{ type: "text", text: "The query was not accepted: odd, but not a query." }], isError: true },
      refused,
      ok(),
      { content: [{ type: "text", text: "The database could not complete this." }], isError: true },
      { content: [{ type: "text", text: "The request was not accepted: request_text must be 1–4,000 characters." }], isError: true },
      refused,
      ok(),
      refused,
      ok(),
    ];
    const report = await runBenchmark({ questions: [question("B-01")], runs: 1, model, server: fakeServer((_, __, n) => script[n - 1]!) });
    expect(calls).toHaveLength(8);
    expect(report.runs[0]![0]).toMatchObject({
      outcome: "given up",
      given: null,
      queries: 7,
      listTables: 1,
      refusedQueries: 3,
      refusals: ["The query was not accepted: it changes data.", "The query was not accepted: it changes data.", "The query was not accepted: it changes data."],
    });
  });

  it("harness_caps_turns_tokens_and_records_refusals", async () => {
    const server = fakeServer(() => ok());
    const turns = fakeModel(() => ({ content: [toolUse("list_tables")] }));
    const byTurns = await runBenchmark({ questions: [question("B-01")], runs: 1, model: turns.model, server });
    expect(turns.calls).toHaveLength(20);
    expect(byTurns.runs[0]![0]).toMatchObject({ outcome: "error", error: "20 model turns" });

    // Cache reads count toward the cap: 50,000 input and 100,000 read is 150,000 a turn.
    const tokens = fakeModel(() => ({ content: [toolUse("list_tables")], input: 50_000, cacheRead: 100_000 }));
    const byTokens = await runBenchmark({ questions: [question("B-01")], runs: 1, model: tokens.model, server });
    expect(tokens.calls).toHaveLength(3);
    expect(byTokens.runs[0]![0]).toMatchObject({ outcome: "error", error: "400,000 input tokens", tokens: { input: 150_000, cacheRead: 300_000 } });

    const refusal = fakeModel(() => ({ content: [toolUse("query", { sql: "SELECT", request_text: "q" })], stop: "refusal" }));
    const byRefusal = await runBenchmark({ questions: [question("B-01"), question("B-02")], runs: 1, model: refusal.model, server });
    expect(server.received.filter(([name]) => name === "query")).toHaveLength(0);
    expect(byRefusal.runs[0]!.map((r) => [r.outcome, r.error])).toEqual([["error", "model refusal"], ["error", "model refusal"]]);

    const failing = async (): Promise<Anthropic.Messages.Message> => {
      throw new Error("529 overloaded");
    };
    const byFailure = await runBenchmark({ questions: [question("B-01")], runs: 1, model: failing, server });
    expect(byFailure.runs[0]![0]).toMatchObject({ outcome: "error", error: "API failure: 529 overloaded" });
  });

  it("harness_stops_at_invocation_token_ceiling", async () => {
    const questions = ["B-01", "B-02", "B-03", "B-04", "B-05"].map((id) => question(id));
    const one = fakeModel(() => ({ content: [text("ANSWER: 12")], input: 3_000_000 }));
    const report = await runBenchmark({ questions, runs: 1, model: one.model, server: fakeServer(() => ok()) });
    expect(one.calls).toHaveLength(3);
    expect(report.runs[0]!.map((r) => r.outcome)).toEqual(["correct", "correct", "correct", "not reached", "not reached"]);
    expect(report.stopped).toBe("8,000,000 input tokens per run");

    // Two runs may spend 16,000,000: the first run's five Questions and the second's first, then no more.
    const two = fakeModel(() => ({ content: [text("ANSWER: 12")], input: 3_000_000 }));
    const twice = await runBenchmark({ questions, runs: 2, model: two.model, server: fakeServer(() => ok()) });
    expect(two.calls).toHaveLength(6);
    expect(twice.runs[1]!.map((r) => r.outcome)).toEqual(["correct", "not reached", "not reached", "not reached", "not reached"]);
  });
});
