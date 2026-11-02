import { handleMcp } from "../src/mcp.js";

/**
 * Test-only Worker: hands every request straight to the MCP handler, skipping the
 * Sign-in block, so the SDK transport can be exercised in workerd.
 * Never deployed; wrangler.jsonc points at src/worker.ts.
 */
export default {
  fetch: (request: Request) => handleMcp(request),
};
