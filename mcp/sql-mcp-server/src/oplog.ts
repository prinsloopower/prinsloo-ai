/**
 * Writes one operational line in the shared envelope. Fields name things —
 * a variable, an issuer, a host — and never carry values, tokens or URL paths.
 */
export function op(event: string, fields: Record<string, string | number> = {}): void {
  console.log(JSON.stringify({ type: "op", event, ts: new Date().toISOString(), ...fields }));
}
