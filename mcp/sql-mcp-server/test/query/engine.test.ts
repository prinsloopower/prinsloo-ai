import { describe, expect, it } from "vitest";
import { planFailure } from "../../src/engine/postgres.js";

describe("Engine adapter: plan-step failures", () => {
  it("plan_step_network_failure_is_connection_error", () => {
    // A lost connection while planning is a Database error, never a Refusal.
    for (const error of [
      Object.assign(new Error("write EPIPE"), { code: "EPIPE" }),
      Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
      Object.assign(new Error("terminating connection"), { code: "08006" }),
      new Error("Connection terminated unexpectedly"),
    ]) {
      expect(planFailure(error), error.message).toEqual({ kind: "error", error, sent: false, ms: 0 });
    }
    // Anything PostgreSQL itself raises while planning is a plan Refusal.
    const undefinedColumn = Object.assign(new Error("column does not exist"), { code: "42703" });
    expect(planFailure(undefinedColumn)).toEqual({ kind: "plan_refused", unaccounted: false, code: "42703" });
  });
});
