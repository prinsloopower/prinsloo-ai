/** Cloudflare's API, for what Wrangler cannot do without a secret on its command line (D-103). */
export type Credentials = { type: "oauth" | "api_token"; token: string } | { type: "api_key"; key: string; email: string };

export type HyperdriveOrigin = { scheme: "postgres"; host: string; port: number; database: string; user: string; password?: string };
export type HyperdriveConfig = { id: string; name: string; origin: Omit<HyperdriveOrigin, "password"> };
export type Binding = { type: string; name: string; text?: string; id?: string };

export class CloudflareError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

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
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { message?: string; code?: number }[] };
    if (!res.ok || json.success === false) {
      const why = (json.errors ?? []).map((e) => e.message ?? `code ${e.code}`).join("; ");
      throw new CloudflareError(res.status, why || `HTTP ${res.status}`);
    }
    return json.result as T;
  }
  const absent = async <T>(p: Promise<T>) => p.catch((e: unknown) => (e instanceof CloudflareError && e.status === 404 ? undefined : Promise.reject(e)));
  return {
    subdomain: () => absent(call<{ subdomain: string }>("GET", "/workers/subdomain")).then((r) => r?.subdomain),
    /** The Worker's bindings, or undefined when no Worker has that name. */
    workerBindings: (name: string) => absent(call<{ bindings: Binding[] }>("GET", `/workers/scripts/${name}/settings`)).then((r) => r?.bindings),
    hyperdrives: () => call<HyperdriveConfig[]>("GET", "/hyperdrive/configs"),
    createHyperdrive: (name: string, origin: HyperdriveOrigin) =>
      call<HyperdriveConfig>("POST", "/hyperdrive/configs", { name, origin, caching: { disabled: true } }),
    updateHyperdrive: (id: string, origin: Partial<HyperdriveOrigin>) =>
      call<HyperdriveConfig>("PATCH", `/hyperdrive/configs/${id}`, { origin, caching: { disabled: true } }),
  };
}

export type Cloudflare = ReturnType<typeof cloudflare>;
