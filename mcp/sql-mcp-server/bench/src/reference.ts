import type { Expected } from "./judge.js";

/** A benchmark Question as `bench/questions.json` holds it (S-004 spec, The question set). */
export type Question = {
  id: string;
  text: string;
  type: Expected["type"];
  expected: Expected;
  /** Computes the expected answer, run as `postgres`. */
  sql: string;
  /** Returns rows of (leader, runner-up) values; each leader must lead by 1%, or by one unit for counts. */
  tie?: { sql: string; counts: boolean };
};

/**
 * A reference query's rows written as an `ANSWER:` value: the first column of the first row for
 * a single value, the first column of every row for a list, and (name, value) rows for a map.
 */
export function answerText(type: Question["type"], rows: unknown[][]): string {
  switch (type) {
    case "list":
      return rows.map((r) => String(r[0])).join(", ");
    case "map":
      return rows.map((r) => `${String(r[0])}=${String(r[1])}`).join(", ");
    case "unavailable":
      return "UNAVAILABLE";
    default:
      return String(rows[0]?.[0]);
  }
}

/** The expected answer a reference query's rows give, for a map with values of the given type. */
export function expectedFrom(type: Question["type"], rows: unknown[][], values: "integer" | "number" = "number"): Expected {
  switch (type) {
    case "integer":
    case "number":
      return { type, value: Number(rows[0]![0]) };
    case "text":
      return { type, value: String(rows[0]![0]) };
    case "list":
      return { type, value: rows.map((r) => String(r[0])) };
    case "map":
      return { type, value: Object.fromEntries(rows.map((r) => [String(r[0]), Number(r[1])])), values };
    case "unavailable":
      return { type };
  }
}

export function tieHolds(lead: number, next: number, counts: boolean): boolean {
  return counts ? lead - next >= 1 : lead >= next * 1.01;
}
