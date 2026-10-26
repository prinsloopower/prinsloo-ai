import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QUESTION_SET } from "../../bench/src/question-set.js";
import type { Question } from "../../bench/src/reference.js";

const QUESTIONS = JSON.parse(readFileSync("bench/questions.json", "utf8")) as Question[];
const TYPES = ["integer", "number", "text", "list", "map", "unavailable"];

describe("S-004 the question set", () => {
  it("question_set_is_well_formed", () => {
    expect(QUESTIONS.map((q) => q.id)).toEqual(Array.from({ length: 40 }, (_, i) => `B-${String(i + 1).padStart(2, "0")}`));
    for (const q of QUESTIONS) {
      expect(q.text.trim().length, q.id).toBeGreaterThan(0);
      expect(TYPES, q.id).toContain(q.type);
      expect(q.expected.type, q.id).toBe(q.type);
      expect(q.sql.trim().length, q.id).toBeGreaterThan(0);
      const e = q.expected as { value?: unknown; values?: unknown };
      if (q.type === "integer") expect(Number.isInteger(e.value), q.id).toBe(true);
      if (q.type === "number") expect(Number.isFinite(e.value), q.id).toBe(true);
      if (q.type === "text") expect(typeof e.value, q.id).toBe("string");
      if (q.type === "list") expect(Array.isArray(e.value) && e.value.every((v) => typeof v === "string"), q.id).toBe(true);
      if (q.type === "map") {
        expect(["integer", "number"], q.id).toContain(e.values);
        expect(Object.values(e.value as object).every((v) => Number.isFinite(v)), q.id).toBe(true);
      }
      if (q.type === "text" || q.type === "list") expect(q.tie, q.id).toBeDefined();
    }
    // The file is the source's questions with their expected answers added, nothing else.
    expect(QUESTIONS.map(({ expected: _, ...q }) => q)).toEqual(QUESTION_SET.map(({ values: _, ...q }) => q));
  });
});
