import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { YTranscript, type Transcript, type QuotaInfo } from "ytranscript-api";
import { renderTranscript, explainError, KEY_URL } from "./format.js";

export const VERSION = "0.1.0";

/** The one method the server needs from the SDK client; injectable for tests. */
export interface TranscriptClient {
  transcript(video: string, opts: { lang?: string }): Promise<Transcript>;
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
        "or jump to specific moments.",
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
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ video, lang, format, max_characters }) => {
      try {
        const c = getClient();
        const t = await c.transcript(video.trim(), lang ? { lang } : {});
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

  return server;
}

export { KEY_URL };
