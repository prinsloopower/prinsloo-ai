import type { ReasonClass } from "./database.js";

/** Maps a `tedious` error to D-080's reason classes. */
export function classifyMssqlError(_error: unknown): ReasonClass {
  return "other";
}
