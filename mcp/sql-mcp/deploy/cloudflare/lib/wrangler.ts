import type { ChildProcess, SpawnOptions } from "node:child_process";
import { join } from "node:path";

export type Spawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;
export type RunResult = { code: number; stdout: string; stderr: string };

/**
 * Runs a Node script with an argument array: no shell, no `npx`, no `npm`. npm logs no command line,
 * and on Windows no `.cmd` shim or `cmd.exe` is involved. A secret goes on standard input,
 * never in `args`.
 */
export function nodeRunner(root: string, spawn: Spawn) {
  return (script: string, args: string[], opts: { env?: Record<string, string>; stdin?: string } = {}) =>
    new Promise<RunResult>((resolve, reject) => {
      const child = spawn(process.execPath, [join(root, script), ...args], {
        cwd: root,
        env: { ...process.env, ...opts.env },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
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

/** Wrangler, run through its own entry point, in the Cloudflare account given. */
export function wranglerRunner(root: string, spawn: Spawn) {
  const run = nodeRunner(root, spawn);
  return (args: string[], opts: { accountId?: string; stdin?: string } = {}) =>
    run(join("node_modules", "wrangler", "bin", "wrangler.js"), args, {
      env: opts.accountId ? { CLOUDFLARE_ACCOUNT_ID: opts.accountId } : {},
      stdin: opts.stdin,
    });
}
