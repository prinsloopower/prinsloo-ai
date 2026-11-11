import { describe, expect, it } from "vitest";
import type { ReasonClass } from "../../src/engine/database.js";
import { classifyMssqlError } from "../../src/engine/mssql.js";

/** A failed connect as `mssql` throws it: a ConnectionError wrapping tedious's own. */
function atConnect(code: string | undefined, number?: number) {
  const inner = Object.assign(new Error("Login failed for user 'x' on db.internal."), { code, ...(number === undefined ? {} : { number }) });
  return Object.assign(new Error(inner.message), { name: "ConnectionError", code, originalError: inner, ...(number === undefined ? {} : { number }) });
}

/** A failed request on a pooled connection, as `mssql` throws it: the number on the error and on tedious's `info`. */
function atRequest(number: number | undefined, code = "EREQUEST") {
  const inner = Object.assign(new Error("Invalid object name 'payroll.salaries'."), number === undefined ? {} : { info: { number } });
  return Object.assign(new Error(inner.message), { name: "RequestError", code, originalError: inner, ...(number === undefined ? {} : { number }) });
}

const CLASSES: Record<Exclude<ReasonClass, "other">, number[]> = {
  connection: [18456, 4060, 40613, 40615, 40532, 40197, 40501, 40549, 10928, 10929],
  timeout: [1222],
  permission: [229, 230, 262],
  constraint: [547, 2601, 2627, 515],
};

describe("MS SQL Server's Database errors", () => {
  it("mssql_errors_classified", () => {
    for (const [cls, numbers] of Object.entries(CLASSES)) {
      for (const n of numbers) expect(classifyMssqlError(atRequest(n)), String(n)).toBe(cls);
    }
    for (const code of ["ESOCKET", "ECONNCLOSED", "ELOGIN", "ETIMEOUT"]) {
      expect(classifyMssqlError(atConnect(code)), code).toBe("connection");
      expect(classifyMssqlError(atRequest(undefined, code)), code).toBe("connection");
    }
    for (const other of [atRequest(8134), atRequest(208), atRequest(undefined), atConnect("EINSTLOOKUP"), new Error("x"), "text", null, undefined]) {
      expect(classifyMssqlError(other)).toBe("other");
    }
  });

  it("mssql_error_number_decides_before_driver_code", () => {
    expect(classifyMssqlError(atRequest(229, "ESOCKET"))).toBe("permission");
    expect(classifyMssqlError(atRequest(1222, "ECONNCLOSED"))).toBe("timeout");
    expect(classifyMssqlError(atConnect("ELOGIN", 547))).toBe("constraint");
    // A number decides even when it is one no class lists.
    expect(classifyMssqlError(atRequest(8134, "ETIMEOUT"))).toBe("other");
    expect(classifyMssqlError(atConnect("ESOCKET", 50000))).toBe("other");
  });

  it("mssql_azure_transient_errors_are_connection_at_connect_and_request", () => {
    for (const n of [40613, 40615, 40532, 40197, 40501]) {
      expect(classifyMssqlError(atConnect("ELOGIN", n)), `connect ${n}`).toBe("connection");
      // At connect time tedious keeps only the code, which is connection too.
      expect(classifyMssqlError(atConnect("ELOGIN")), `connect ${n}`).toBe("connection");
      expect(classifyMssqlError(atRequest(n)), `request ${n}`).toBe("connection");
      // The number alone, as tedious's `info` carries it.
      expect(classifyMssqlError({ originalError: { info: { number: n } } }), `info ${n}`).toBe("connection");
    }
  });

  it("mssql_resource_limit_errors_are_connection", () => {
    for (const n of [10928, 10929, 40549, 40501]) {
      expect(classifyMssqlError(atRequest(n)), String(n)).toBe("connection");
      expect(classifyMssqlError(atConnect("ELOGIN", n)), String(n)).toBe("connection");
    }
  });

  it("mssql_lock_timeout_is_timeout", () => {
    expect(classifyMssqlError(atRequest(1222))).toBe("timeout");
    expect(classifyMssqlError({ originalError: { info: { number: 1222 } } })).toBe("timeout");
  });
});
