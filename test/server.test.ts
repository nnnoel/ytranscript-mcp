import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { YTranscriptError, type Transcript, type Video, type VideoList, type VideosOptions } from "ytranscript-api";
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

const list: VideoList = {
  type: "channel",
  channelId: "UC1234567890123456789012",
  playlistId: "UU1234567890123456789012",
  title: "Uploads from Test Channel",
  videos: [
    { videoId: "abcdefghijk", title: "Newest talk", publishedAt: "2026-11-19T03:15:09.000Z", publishedAtExact: true, publishedText: "6 days ago", durationSeconds: 3725, viewCount: 1234, },
    { videoId: "bcdefghijkl", title: "Older talk", publishedAt: "2025-06-01", publishedAtExact: false, publishedText: "1 year ago", durationSeconds: 59, viewCount: null },
  ],
  nextCursor: "CURSOR123",
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
  videosImpl: TranscriptClient["videos"] = async () => list,
): TranscriptClient & { calls: unknown[][]; videoCalls: string[]; listCalls: VideosOptions[] } {
  const calls: unknown[][] = [];
  const videoCalls: string[] = [];
  const listCalls: VideosOptions[] = [];
  return {
    calls,
    videoCalls,
    listCalls,
    videos: (o) => {
      listCalls.push(o);
      return videosImpl(o);
    },
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
  it("lists the tools with their input schemas, even without an API key", async () => {
    const client = await connect({});
    const { tools } = await client.listTools();
    expect(tools.map((x) => x.name)).toEqual(["get_transcript", "get_video_info", "list_videos"]);
    expect(Object.keys((tools[2].inputSchema as { properties: object }).properties)).toEqual(
      ["channel", "playlist", "content", "published_after", "limit", "cursor"],
    );
    const props = (i: number) => Object.keys((tools[i].inputSchema as { properties: object }).properties);
    expect(props(0)).toEqual(expect.arrayContaining(["video", "lang", "format", "max_characters", "include_video_info", "max_units"]));
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

  it("passes max_units through as maxUnits and explains a refusal", async () => {
    const fake = fakeClient(async () => {
      throw new YTranscriptError("max_units_exceeded", 422, "It would cost about 9 units.", undefined, 9);
    });
    const client = await connect({ client: fake });
    const r = await client.callTool({ name: "get_transcript", arguments: { video: "abcdefghijk", max_units: 5 } });
    expect(fake.calls[0]).toEqual(["abcdefghijk", { maxUnits: 5 }]);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("Nothing was transcribed or charged");
    expect(text(r)).toContain("about 9 units");
  });

  it("rejects a max_units that isn't a positive whole number", async () => {
    const fake = fakeClient(async () => sample);
    const client = await connect({ client: fake });
    const r = await client.callTool({ name: "get_transcript", arguments: { video: "abcdefghijk", max_units: 0 } });
    expect(r.isError).toBe(true);
    expect(fake.calls).toHaveLength(0);
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

  it("list_videos lists a channel's videos and passes the options through", async () => {
    const fake = fakeClient(async () => sample);
    const client = await connect({ client: fake });
    const r = await client.callTool({ name: "list_videos", arguments: { channel: " @testchannel ", content: "videos", published_after: "2025-01-01", limit: 2 } });
    expect(r.isError).toBeFalsy();
    expect(fake.listCalls).toEqual([{ channel: "@testchannel", content: "videos", publishedAfter: "2025-01-01", limit: 2 }]);
    const t = text(r);
    expect(t).toContain("Channel: https://www.youtube.com/channel/UC1234567890123456789012");
    expect(t).toContain("2 videos, newest first");
    expect(t).toContain("- https://youtu.be/abcdefghijk | 2026-11-19 | 1:02:05 | 1,234 views | Newest talk");
    expect(t).toContain("- https://youtu.be/bcdefghijkl | about 2025-06-01 | 0:59 | Older talk");
    expect(t).toContain('Dates marked "about" are estimated');
    expect(t).toContain("cursor: CURSOR123");
    expect(t).toContain("7 of 1,000 units");
  });

  it("list_videos with a cursor sends only the cursor and limit, and says when the list is done", async () => {
    const fake = fakeClient(async () => sample, undefined, async () => ({ ...list, type: "playlist", channelId: null, videos: [list.videos[0]], nextCursor: null }));
    const client = await connect({ client: fake });
    const r = await client.callTool({ name: "list_videos", arguments: { cursor: "CURSOR123", channel: "@ignored", limit: 50 } });
    expect(fake.listCalls).toEqual([{ cursor: "CURSOR123", limit: 50 }]);
    expect(text(r)).toContain("Playlist: Uploads from Test Channel (UU1234567890123456789012)");
    expect(text(r)).toContain("1 video, in playlist order");
    expect(text(r)).toContain("That is all the videos.");
    expect(text(r)).not.toContain("estimated");
  });

  it("list_videos needs exactly one of channel or playlist", async () => {
    const fake = fakeClient(async () => sample);
    const client = await connect({ client: fake });
    for (const args of [{}, { channel: "@a", playlist: "PLx" }]) {
      const r = await client.callTool({ name: "list_videos", arguments: args });
      expect(r.isError).toBe(true);
      expect(text(r)).toContain("either channel or playlist");
    }
    const bad = await client.callTool({ name: "list_videos", arguments: { channel: "@a", published_after: "Nov 1" } });
    expect(bad.isError).toBe(true);
    expect(fake.listCalls).toEqual([]);
  });

  it("list_videos explains a missing channel without talking about videos", async () => {
    const fake = fakeClient(async () => sample, undefined, async () => {
      throw new YTranscriptError("not_found", 404, "Channel not found.");
    });
    const client = await connect({ client: fake });
    const r = await client.callTool({ name: "list_videos", arguments: { channel: "@nobody" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("This channel or playlist doesn't exist");
  });
});
