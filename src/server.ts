import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { YTranscript, type Transcript, type Video, type VideoList, type VideosOptions, type QuotaInfo } from "ytranscript-api";
import { renderTranscript, renderVideoInfo, renderVideoList, explainError, KEY_URL } from "./format.js";

export const VERSION = "0.5.0";

/** The methods the server needs from the SDK client; injectable for tests. */
export interface TranscriptClient {
  transcript(video: string, opts: { lang?: string; metadata?: boolean; maxUnits?: number }): Promise<Transcript>;
  video(video: string): Promise<Video>;
  videos(options: VideosOptions): Promise<VideoList>;
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
          .describe("Preferred language code, e.g. 'en' or 'es'. Omit to get the video's original language. A video with no captions in that language is transcribed with AI in the language actually spoken (see lang in the result)."),
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

  server.registerTool(
    "list_videos",
    {
      title: "List a YouTube channel's or playlist's videos",
      description:
        "List the videos of a YouTube channel (newest first) or a playlist (in playlist order), with " +
        "each video's title, URL, publish date, length and views. Give either channel or playlist. Use " +
        "published_after to get only recent videos, then call get_transcript on the ones you need. " +
        "Costs 1 unit per started 100 videos. When the result says more videos are available, call again " +
        "with the cursor it gives.",
      inputSchema: {
        channel: z.string().min(1).optional().describe("An @handle, a channel URL or a channel ID (UC...)"),
        playlist: z.string().min(1).optional().describe("A playlist ID or a YouTube URL with list= (instead of channel)"),
        content: z
          .enum(["all", "videos"])
          .optional()
          .describe("Channels only. 'all' (default) includes Shorts and live streams; 'videos' returns regular videos only."),
        published_after: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in the form YYYY-MM-DD")
          .optional()
          .describe("Only videos published on or after this date, YYYY-MM-DD (UTC)."),
        limit: z.number().int().min(1).max(500).optional().describe("How many videos to return, 1 to 500. Default 100."),
        cursor: z
          .string()
          .min(1)
          .optional()
          .describe("The cursor from a previous list_videos result, to get the next videos. It already carries the channel or playlist and the filters."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ channel, playlist, content, published_after, limit, cursor }) => {
      if (!cursor && !channel === !playlist) {
        return { isError: true, content: [{ type: "text", text: "Give either channel or playlist (not both), or a cursor from a previous result." }] };
      }
      try {
        const c = getClient();
        const options: VideosOptions = cursor
          ? { cursor: cursor.trim() }
          : {
              ...(channel ? { channel: channel.trim() } : {}),
              ...(playlist ? { playlist: playlist.trim() } : {}),
              ...(content ? { content } : {}),
              ...(published_after ? { publishedAfter: published_after } : {}),
            };
        if (limit !== undefined) options.limit = limit;
        const list = await c.videos(options);
        return { content: [{ type: "text", text: renderVideoList(list, c.lastQuota) }] };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: explainError(err, "list") }] };
      }
    },
  );

  return server;
}

export { KEY_URL };
