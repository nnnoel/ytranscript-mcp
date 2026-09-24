import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { YTranscriptError, type Transcript } from "ytranscript-api";
import { createServer, type TranscriptClient } from "../src/server.js";

const sample: Transcript = {
  videoId: "abcdefghijk",
  lang: "en",
  whisper: false,
  cached: true,
  unitsCharged: 1,
  segments: [{ text: "hi", offset: 0, duration: 500 }],
  text: "hi",
};

/** Connect a real MCP client to the server over an in-memory transport. */
async function connect(opts: Parameters<typeof createServer>[0]) {
  const server = createServer(opts);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

function fakeClient(impl: TranscriptClient["transcript"]): TranscriptClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    lastQuota: { limit: 1000, used: 7, rateLimitRemaining: 29 },
    transcript: (...args) => {
      calls.push(args);
      return impl(...args);
    },
  };
}

const text = (r: Awaited<ReturnType<Client["callTool"]>>) =>
  (r.content as { type: string; text: string }[])[0].text;

describe("MCP server", () => {
  it("lists get_transcript with its input schema, even without an API key", async () => {
    const client = await connect({});
    const { tools } = await client.listTools();
    expect(tools.map((x) => x.name)).toEqual(["get_transcript"]);
    const props = Object.keys((tools[0].inputSchema as { properties: object }).properties);
    expect(props).toEqual(expect.arrayContaining(["video", "lang", "format", "max_characters"]));
    expect(tools[0].annotations?.readOnlyHint).toBe(true);
  });

  it("returns a formatted transcript and passes video + lang through", async () => {
    const fake = fakeClient(async () => sample);
    const client = await connect({ client: fake });
    const r = await client.callTool({ name: "get_transcript", arguments: { video: " https://youtu.be/abcdefghijk ", lang: "en", format: "timestamped" } });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain("[0:00] hi");
    expect(text(r)).toContain("7 of 1,000 units");
    expect(fake.calls[0]).toEqual(["https://youtu.be/abcdefghijk", { lang: "en" }]);
  });

  it("omits lang when not given (so the API returns the original language)", async () => {
    const fake = fakeClient(async () => sample);
    const client = await connect({ client: fake });
    await client.callTool({ name: "get_transcript", arguments: { video: "abcdefghijk" } });
    expect(fake.calls[0]).toEqual(["abcdefghijk", {}]);
  });

  it("turns API errors into an isError result with guidance, not a protocol failure", async () => {
    const fake = fakeClient(async () => {
      throw new YTranscriptError("quota_exceeded", 402, "Monthly quota exhausted.");
    });
    const client = await connect({ client: fake });
    const r = await client.callTool({ name: "get_transcript", arguments: { video: "abcdefghijk" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("resets on the 1st");
  });

  it("with no API key configured, explains how to get one", async () => {
    const client = await connect({ apiKey: "" });
    const r = await client.callTool({ name: "get_transcript", arguments: { video: "abcdefghijk" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("YTRANSCRIPT_API_KEY");
  });
});
