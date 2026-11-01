/** Cloudflare's API, for what Wrangler cannot do without a secret on its command line (D-103). */
export type Credentials = { type: "oauth" | "api_token"; token: string } | { type: "api_key"; key: string; email: string };

export type HyperdriveOrigin = { scheme: "postgres"; host: string; port: number; database: string; user: string; password?: string };
export type HyperdriveConfig = { id: string; name: string; origin: Omit<HyperdriveOrigin, "password"> };
/** A Worker's binding as its settings list it: `plain_text` vars, `secret_text` secrets (names only), and others. */
export type Binding = { type: string; name: string; text?: string; id?: string };

export class CloudflareError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Cloudflare's own error codes, when the body gave any. */
    readonly codes: number[] = [],
  ) {
    super(message);
  }
}

/**
 * Cloudflare's code for "no Worker of that name", as distinct from any other 404. Checked against the
 * live API first by the T-008 trial; a wrong code fails safe, stopping setup at step 2.
 */
const SCRIPT_NOT_FOUND = 10007;

export function cloudflare(fetchFn: typeof fetch, credentials: Credentials, accountId: string) {
  const headers: Record<string, string> =
    credentials.type === "api_key"
      ? { "x-auth-key": credentials.key, "x-auth-email": credentials.email }
      : { authorization: `Bearer ${credentials.token}` };
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchFn(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // A body that does not parse leaves no reason to report, and no result to return.
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { message?: string; code?: number }[] };
    if (!res.ok || json.success === false) {
      const why = (json.errors ?? []).map((e) => e.message ?? `code ${e.code}`).join("; ");
      throw new CloudflareError(res.status, why || `HTTP ${res.status}`, (json.errors ?? []).flatMap((e) => (e.code === undefined ? [] : [e.code])));
    }
    if (json.result === undefined) throw new CloudflareError(res.status, `${method} ${path} answered with no result`);
    return json.result;
  }
  const absent = async <T>(p: Promise<T>, when: (e: CloudflareError) => boolean) =>
    p.catch((e: unknown) => (e instanceof CloudflareError && e.status === 404 && when(e) ? undefined : Promise.reject(e)));
  return {
    subdomain: () => absent(call<{ subdomain: string }>("GET", "/workers/subdomain"), () => true).then((r) => r?.subdomain),
    /**
     * The Worker's bindings, or undefined when no Worker has that name. Any other 404 is an error:
     * read as "no Worker", it would have setup put a new SERVER_SECRET on a live one.
     */
    workerBindings: (name: string) =>
      absent(call<{ bindings: Binding[] }>("GET", `/workers/scripts/${name}/settings`), (e) => e.codes.includes(SCRIPT_NOT_FOUND)).then((r) => r?.bindings),
    hyperdrives: () => call<HyperdriveConfig[]>("GET", "/hyperdrive/configs"),
    createHyperdrive: (name: string, origin: HyperdriveOrigin) =>
      call<HyperdriveConfig>("POST", "/hyperdrive/configs", { name, origin, caching: { disabled: true } }),
    updateHyperdrive: (id: string, origin: Partial<HyperdriveOrigin>) =>
      call<HyperdriveConfig>("PATCH", `/hyperdrive/configs/${id}`, { origin, caching: { disabled: true } }),
  };
}

export type Cloudflare = ReturnType<typeof cloudflare>;
