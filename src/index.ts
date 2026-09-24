import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, VERSION, KEY_URL } from "./server.js";

// stdout carries the MCP protocol. Log only to stderr.
async function main(): Promise<void> {
  const apiKey = process.env.YTRANSCRIPT_API_KEY?.trim();
  if (!apiKey) {
    console.error(`[ytranscript-mcp] YTRANSCRIPT_API_KEY is not set. Tools will explain how to get a free key at ${KEY_URL}`);
  }
  const server = createServer({ apiKey });
  await server.connect(new StdioServerTransport());
  console.error(`[ytranscript-mcp] v${VERSION} running on stdio`);
}

main().catch((err) => {
  console.error("[ytranscript-mcp] fatal:", err);
  process.exit(1);
});
