/** What a Question's answer must be (S-004 spec, Judging). */
export type Expected =
  | { type: "integer"; value: number }
  | { type: "number"; value: number }
  | { type: "text"; value: string }
  | { type: "list"; value: string[] }
  | { type: "map"; value: Record<string, number>; values: "integer" | "number" }
  | { type: "unavailable" };

/** Floating point puts a difference of exactly the tolerance a hair beyond it. */
const EPSILON = 1e-9;

/** Backticks, `*` and `_` at either end, as Markdown emphasis and code put them. */
const markdown = (s: string) => s.replace(/^[\s`*_]+|[\s`*_]+$/g, "");

/**
 * Removes the Markdown around a line, a value or an item, keeping its full stops where they end it:
 * `**Feta Tub**.` and `**Feta Tub.**` both become `Feta Tub.`.
 */
function unwrap(s: string): string {
  const bare = markdown(s);
  return bare.endsWith(".") ? `${markdown(bare.slice(0, -1))}.` : bare;
}

/** One trailing full stop, which an answer, a list item, a map key and a map value may each end in. */
const fullStop = (s: string) => s.replace(/\.$/, "");

/**
 * Judges a reply by its last `ANSWER:` line. Markdown is removed around the line, the value, and each
 * list item, map key and map value, and each of those may end in one full stop.
 */
export function judge(reply: string, expected: Expected): { correct: boolean; given: string | null } {
  const answers = reply
    .split(/\r?\n/)
    .map((line) => unwrap(line.replace(/^\s*>\s*/, "")))
    .filter((line) => line.startsWith("ANSWER:"));
  const last = answers.at(-1);
  if (last === undefined) return { correct: false, given: null };
  const value = unwrap(last.slice("ANSWER:".length));
  return { correct: matches(value, expected), given: fullStop(value) };
}

function matches(given: string, expected: Expected): boolean {
  switch (expected.type) {
    case "integer":
    case "number":
      return numberMatches(given.replace(/,/g, ""), expected.type, expected.value);
    case "text":
      return text(given) === text(expected.value);
    case "unavailable":
      return text(given) === "unavailable";
    case "list": {
      const got = new Set(given.split(",").map((item) => text(unwrap(item))));
      const want = new Set(expected.value.map(text));
      return got.size === want.size && [...want].every((v) => got.has(v));
    }
    case "map": {
      const want = new Map(Object.entries(expected.value).map(([k, v]) => [text(k), v]));
      const pairs = given.split(",").map((pair) => pair.split("="));
      if (pairs.some((p) => p.length !== 2)) return false;
      const got = new Map(pairs.map(([k, v]) => [text(unwrap(k!)), unwrap(v!)]));
      return (
        got.size === want.size &&
        [...want].every(([k, v]) => got.has(k) && numberMatches(got.get(k)!, expected.values, v))
      );
    }
  }
}

function numberMatches(given: string, type: "integer" | "number", value: number): boolean {
  const s = fullStop(given.replace(/\s/g, ""));
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return false;
  const n = Number(s);
  if (type === "integer") return n === value;
  return Math.abs(n - value) <= Math.max(Math.abs(value) * 0.005, 0.01) + EPSILON;
}

/** Text compares ignoring case, surrounding spaces and one trailing full stop; a run of inner spaces counts as one. */
function text(s: string): string {
  return fullStop(s.trim()).trim().replace(/\s+/g, " ").toLowerCase();
}
