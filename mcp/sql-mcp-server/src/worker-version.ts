/**
 * The deployed Worker's version id, from Cloudflare's version-metadata binding, which `initialize`
 * reports after the package version so a benchmark report names the release it measured (S-004).
 */
export function workerVersionOf(env: { VERSION_METADATA?: WorkerVersionMetadata }): string | undefined {
  return env.VERSION_METADATA?.id;
}
