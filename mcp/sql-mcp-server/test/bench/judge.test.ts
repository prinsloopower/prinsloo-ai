import { describe, expect, it } from "vitest";
import { judge } from "../../bench/src/judge.js";

const ok = (reply: string, expected: Parameters<typeof judge>[1]) => judge(reply, expected).correct;

describe("S-004 the Judge", () => {
  it("judge_numbers_within_tolerance", () => {
    const e = { type: "number", value: 1234.56 } as const;
    expect(ok("ANSWER: 1234.56", e)).toBe(true);
    expect(ok("ANSWER: 1238.00", e)).toBe(true);
    expect(ok("ANSWER: 1241", e)).toBe(false);
    const half = { type: "number", value: 0.5 } as const;
    expect(ok("ANSWER: 0.50", half)).toBe(true);
    expect(ok("ANSWER: 0.509", half)).toBe(true);
    // 0.51 is exactly 0.01 away, which floating point puts a hair beyond; the Judge allows for that.
    expect(ok("ANSWER: 0.51", half)).toBe(true);
    expect(ok("ANSWER: 0.52", half)).toBe(false);
    expect(ok("ANSWER: 7.46", { type: "number", value: 7.46 })).toBe(true);
    expect(ok("ANSWER: 7.5", { type: "number", value: 7.46 })).toBe(false);
    expect(ok("ANSWER: 42", { type: "integer", value: 42 })).toBe(true);
    expect(ok("ANSWER: 43", { type: "integer", value: 42 })).toBe(false);
  });

  it("judge_text_lists_and_maps", () => {
    expect(ok("ANSWER: north", { type: "text", value: "North" })).toBe(true);
    expect(ok("ANSWER:  North. ", { type: "text", value: "North" })).toBe(true);
    expect(ok("ANSWER: South", { type: "text", value: "North" })).toBe(false);
    expect(ok("ANSWER: b, a", { type: "list", value: ["a", "b"] })).toBe(true);
    expect(ok("ANSWER: a", { type: "list", value: ["a", "b"] })).toBe(false);
    expect(ok("ANSWER: a, b, c", { type: "list", value: ["a", "b"] })).toBe(false);
    const map = { type: "map", value: { North: 10, South: 20 }, values: "number" } as const;
    expect(ok("ANSWER: North=10, South=20.05", map)).toBe(true);
    expect(ok("ANSWER: south=20, north=10", map)).toBe(true);
    expect(ok("ANSWER: North=10", map)).toBe(false);
    expect(ok("ANSWER: North=10, South=21", map)).toBe(false);
    const counts = { type: "map", value: { pending: 12, shipped: 900 }, values: "integer" } as const;
    expect(ok("ANSWER: pending=12, shipped=900", counts)).toBe(true);
    expect(ok("ANSWER: pending=12, shipped=901", counts)).toBe(false);
    expect(ok("ANSWER: UNAVAILABLE", { type: "unavailable" })).toBe(true);
    expect(ok("ANSWER: unavailable", { type: "unavailable" })).toBe(true);
    expect(ok("ANSWER: 0", { type: "unavailable" })).toBe(false);
  });

  it("judge_reads_last_answer_line", () => {
    const reply = "First I thought:\nANSWER: 10\nThen I checked again.\nANSWER: 12";
    expect(judge(reply, { type: "integer", value: 12 })).toEqual({ correct: true, given: "12" });
    expect(ok(reply, { type: "integer", value: 10 })).toBe(false);
  });

  it("judge_missing_answer_line_is_incorrect", () => {
    expect(judge("The answer is 12.", { type: "integer", value: 12 })).toEqual({ correct: false, given: null });
    expect(judge("", { type: "unavailable" })).toEqual({ correct: false, given: null });
  });

  it("judge_tolerates_markdown_and_number_formats", () => {
    expect(ok("ANSWER: 10234.00", { type: "integer", value: 10234 })).toBe(true);
    expect(ok("**ANSWER: `10234`**", { type: "integer", value: 10234 })).toBe(true);
    expect(ok("> ANSWER: 10,234", { type: "integer", value: 10234 })).toBe(true);
    expect(ok("ANSWER: 10234.5", { type: "integer", value: 10234 })).toBe(false);
    expect(ok("ANSWER: saturday", { type: "text", value: "Saturday" })).toBe(true);
    expect(ok("ANSWER: Sat", { type: "text", value: "Saturday" })).toBe(false);
    expect(ok("_ANSWER: 1,234.56_", { type: "number", value: 1234.56 })).toBe(true);
  });
});

describe("S-004 the Judge, after review 2 (D-098)", () => {
  it("judge_tolerates_markdown_around_a_full_stop", () => {
    expect(judge("ANSWER: **Olive Oil 5L**.", { type: "text", value: "Olive Oil 5L" })).toEqual({ correct: true, given: "Olive Oil 5L" });
    expect(judge("**ANSWER: Olive Oil 5L**.", { type: "text", value: "Olive Oil 5L" }).correct).toBe(true);
    expect(judge("ANSWER: **42**.", { type: "integer", value: 42 }).correct).toBe(true);
    expect(judge("`ANSWER: 42`.", { type: "integer", value: 42 }).correct).toBe(true);
    expect(judge("ANSWER: `Feta Tub`, `Seed Crackers`", { type: "list", value: ["Feta Tub", "Seed Crackers"] }).correct).toBe(true);
    expect(judge("ANSWER: **Elm Street Deli**=3", { type: "map", value: { "Elm Street Deli": 3 }, values: "integer" }).correct).toBe(true);
    expect(judge("ANSWER: North=`10.00`, South=**20**", { type: "map", value: { North: 10, South: 20 }, values: "number" }).correct).toBe(true);
    // Markdown inside a value is still part of it.
    expect(judge("ANSWER: **Olive_Oil 5L**.", { type: "text", value: "Olive Oil 5L" }).correct).toBe(false);
  });
});
