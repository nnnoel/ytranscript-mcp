import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { YTranscript, type Transcript, type Video, type QuotaInfo } from "ytranscript-api";
import { renderTranscript, renderVideoInfo, explainError, KEY_URL } from "./format.js";

export const VERSION = "0.2.1";

/** The methods the server needs from the SDK client; injectable for tests. */
export interface TranscriptClient {
  transcript(video: string, opts: { lang?: string; metadata?: boolean; maxUnits?: number }): Promise<Transcript>;
  video(video: string): Promise<Video>;
  lastQuota: QuotaInfo | null;
}

export interface ServerOptions {
  apiKey?: string;
  /** Test hook: supply a fake client instead of calling the real API. */
  client?: TranscriptClient;
}

export function createServer(opts: ServerOptions = {}): McpServer {
  const server = new McpServer({ name: "ytranscript", version: VERSION });

  // The server starts and lists its tools even without a key (so MCP directories and
  // inspectors can see it); a missing key becomes a clear message at call time instead.
  let client: TranscriptClient | null = opts.client ?? null;
  const getClient = (): TranscriptClient => {
    if (!client) client = new YTranscript(opts.apiKey ?? "");
    return client;
  };

  server.registerTool(
    "get_transcript",
    {
      title: "Get YouTube transcript",
      description:
        "Get the transcript of a YouTube video. Accepts a video URL (watch, youtu.be, shorts, embed) " +
        "or an 11-character video ID. Returns the video's spoken language by default. Videos without " +
        "captions are transcribed with AI speech-to-text. Use format=timestamped when you need to cite " +
        "or jump to specific moments. Set include_video_info=true to also get the title, channel, " +
        "publish date, duration and view count at no extra cost.",
      inputSchema: {
        video: z.string().min(1).describe("YouTube video URL or 11-character video ID"),
        lang: z
          .string()
          .optional()
          .describe("Language code of the caption track to fetch, e.g. 'en' or 'es'. Omit to get the video's original language."),
        format: z
          .enum(["text", "timestamped"])
          .optional()
          .describe("'text' (default): one block of plain text. 'timestamped': one line per segment with [m:ss] times."),
        max_characters: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Truncate the transcript to about this many characters. Useful for very long videos."),
        include_video_info: z
          .boolean()
          .optional()
          .describe("Also return the video's title, channel, publish date, duration and view count above the transcript. Free."),
        max_units: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "The most this request may cost, in units. A video without captions needs AI transcription, " +
              "which costs 1 unit per minute of audio (at least 5); if that would exceed max_units, nothing is " +
              "transcribed or charged and the error gives the estimate. 1 means captions only.",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ video, lang, format, max_characters, include_video_info, max_units }) => {
      try {
        const c = getClient();
        const t = await c.transcript(video.trim(), {
          ...(lang ? { lang } : {}),
          ...(include_video_info ? { metadata: true } : {}),
          ...(max_units !== undefined ? { maxUnits: max_units } : {}),
        });
        return {
          content: [
            { type: "text", text: renderTranscript(t, { format, maxCharacters: max_characters, quota: c.lastQuota }) },
          ],
        };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: explainError(err) }] };
      }
    },
  );

  server.registerTool(
    "get_video_info",
    {
      title: "Get YouTube video info",
      description:
        "Get details about a YouTube video without its transcript: title, description, channel, " +
        "publish date, duration, view and like counts, tags, category and chapters. Accepts a video " +
        "URL or an 11-character video ID. Use it to check what a video is, or how long it is, before " +
        "fetching the transcript. If you need the transcript too, call get_transcript with " +
        "include_video_info=true instead.",
      inputSchema: {
        video: z.string().min(1).describe("YouTube video URL or 11-character video ID"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ video }) => {
      try {
        const c = getClient();
        const v = await c.video(video.trim());
        return { content: [{ type: "text", text: renderVideoInfo(v, c.lastQuota) }] };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: explainError(err) }] };
      }
    },
  );

  return server;
}

export { KEY_URL };
