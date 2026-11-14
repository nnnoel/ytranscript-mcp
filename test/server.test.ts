import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { YTranscriptError, type Transcript, type Video } from "ytranscript-api";
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

const video: Video = {
  videoId: "abcdefghijk",
  title: "A talk about tests",
  description: "Slides at example.com",
  durationSeconds: 213,
  viewCount: 1234567,
  likeCount: 8900,
  publishedAt: "2024-05-01T10:00:00-07:00",
  channel: { id: "UC123", name: "Test Channel", handle: "@testchannel", url: "https://www.youtube.com/@testchannel", subscriberCount: 4560000 },
  tags: ["testing", "talks"],
  category: "Education",
  chapters: [{ title: "Intro", startSeconds: 0 }, { title: "Demo", startSeconds: 65 }],
  thumbnails: [],
  isLive: false,
  cached: false,
  unitsCharged: 1,
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

function fakeClient(
  impl: TranscriptClient["transcript"],
  videoImpl: TranscriptClient["video"] = async () => video,
): TranscriptClient & { calls: unknown[][]; videoCalls: string[] } {
  const calls: unknown[][] = [];
  const videoCalls: string[] = [];
  return {
    calls,
    videoCalls,
    video: (v) => {
      videoCalls.push(v);
      return videoImpl(v);
    },
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
  it("lists both tools with their input schemas, even without an API key", async () => {
    const client = await connect({});
    const { tools } = await client.listTools();
    expect(tools.map((x) => x.name)).toEqual(["get_transcript", "get_video_info"]);
    const props = (i: number) => Object.keys((tools[i].inputSchema as { properties: object }).properties);
    expect(props(0)).toEqual(expect.arrayContaining(["video", "lang", "format", "max_characters", "include_video_info"]));
    expect(props(1)).toEqual(["video"]);
    for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("get_video_info returns the video's details and passes the video through", async () => {
    const fake = fakeClient(async () => sample);
    const client = await connect({ client: fake });
    const r = await client.callTool({ name: "get_video_info", arguments: { video: " https://youtu.be/abcdefghijk " } });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain("Title: A talk about tests");
    expect(text(r)).toContain("[1:05] Demo");
    expect(text(r)).toContain("7 of 1,000 units");
    expect(fake.videoCalls).toEqual(["https://youtu.be/abcdefghijk"]);
    expect(fake.calls).toEqual([]);
  });

  it("get_video_info turns API errors into an isError result with guidance", async () => {
    const fake = fakeClient(async () => sample, async () => {
      throw new YTranscriptError("temporarily_unavailable", 503, "Blocked.", 60);
    });
    const client = await connect({ client: fake });
    const r = await client.callTool({ name: "get_video_info", arguments: { video: "abcdefghijk" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("about 60 seconds");
    expect(text(r)).toContain("Nothing was charged");
  });

  it("include_video_info asks for metadata and shows it above the transcript", async () => {
    const { cached: _c, unitsCharged: _u, ...metadata } = video;
    const fake = fakeClient(async () => ({ ...sample, metadata }));
    const client = await connect({ client: fake });
    const r = await client.callTool({ name: "get_transcript", arguments: { video: "abcdefghijk", include_video_info: true } });
    expect(fake.calls[0]).toEqual(["abcdefghijk", { metadata: true }]);
    expect(text(r)).toContain("Title: A talk about tests");
    expect(text(r)).toContain("Channel: Test Channel (@testchannel, about 4,560,000 subscribers)");
    expect(fake.videoCalls).toEqual([]);
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
