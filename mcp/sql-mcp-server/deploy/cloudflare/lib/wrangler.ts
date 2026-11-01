import type { ChildProcess, SpawnOptions } from "node:child_process";
import { join } from "node:path";
import type { RunResult } from "./setup.js";

export type Spawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

/**
 * Runs Wrangler as Node with Wrangler's own entry point and an argument array: no shell, no `npx`,
 * no `npm`. npm logs no command line, and on Windows no `.cmd` shim or `cmd.exe` is involved (D-103).
 * A secret goes on standard input, never in `args`.
 */
export function wranglerRunner(root: string, spawn: Spawn) {
  const entry = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
  return (args: string[], opts: { accountId?: string; stdin?: string } = {}) =>
    new Promise<RunResult>((resolve, reject) => {
      const env = { ...process.env, ...(opts.accountId ? { CLOUDFLARE_ACCOUNT_ID: opts.accountId } : {}) };
      const child = spawn(process.execPath, [entry, ...args], { cwd: root, env, shell: false, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("error", reject);
      child.on("close", (code: number | null) => resolve({ code: code ?? 1, stdout, stderr }));
      if (opts.stdin !== undefined) child.stdin?.write(opts.stdin);
      child.stdin?.end();
    });
}
