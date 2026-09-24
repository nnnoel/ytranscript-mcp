/**
 * Pure formatting helpers: turn API results and errors into text an AI assistant can use.
 * No I/O here, so everything in this file is unit-tested.
 */
import type { Transcript, QuotaInfo } from "ytranscript-api";
import { YTranscriptError } from "ytranscript-api";

export type TranscriptFormat = "text" | "timestamped";

export const KEY_URL = "https://ytranscript.com/developers";

/** 61_000 -> "1:01", 3_661_000 -> "1:01:01" */
export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export interface RenderOptions {
  format?: TranscriptFormat;
  /** Cut the body at this many characters and say so. Protects the model's context window. */
  maxCharacters?: number;
  quota?: QuotaInfo | null;
}

export function renderTranscript(t: Transcript, opts: RenderOptions = {}): string {
  const format = opts.format ?? "text";
  const source = t.whisper ? "AI speech-to-text (the video has no captions)" : "YouTube captions";
  const header = `Transcript of https://youtu.be/${t.videoId} (language: ${t.lang}, source: ${source})`;

  const fullBody =
    format === "timestamped"
      ? t.segments.map((s) => `[${formatTimestamp(s.offset)}] ${s.text}`).join("\n")
      : t.segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();

  let body = fullBody;
  let truncationNote = "";
  const max = opts.maxCharacters;
  if (max && max > 0 && fullBody.length > max) {
    const shown = fullBody.slice(0, max);
    // End on a whole line (timestamped) or word (text) so the model never sees a split word;
    // don't back up more than 20% to find one.
    const boundary = shown.lastIndexOf(format === "timestamped" ? "\n" : " ");
    body = shown.slice(0, boundary >= max * 0.8 ? boundary : max).trimEnd();
    const n = (x: number) => x.toLocaleString("en-US");
    truncationNote = `\n\n[Truncated: showing ${n(body.length)} of ${n(fullBody.length)} characters. Call again with a larger max_characters to see more.]`;
  }

  return `${header}\n\n${body}${truncationNote}${renderQuota(t, opts.quota)}`;
}

export function renderQuota(t: Pick<Transcript, "unitsCharged">, quota?: QuotaInfo | null): string {
  if (!quota) return "";
  const units = t.unitsCharged === 1 ? "1 unit" : `${t.unitsCharged} units`;
  return `\n\n(yTranscript: this request used ${units}; ${quota.used.toLocaleString("en-US")} of ${quota.limit.toLocaleString("en-US")} units used this month.)`;
}

/** A clear, actionable message for every failure the API can return. */
export function explainError(err: unknown): string {
  if (err instanceof YTranscriptError) {
    switch (err.code) {
      case "unauthorized":
        return `The yTranscript API key is missing or invalid. Get a free key at ${KEY_URL} and set it as YTRANSCRIPT_API_KEY in this MCP server's configuration.`;
      case "quota_exceeded":
        return `The monthly yTranscript quota is used up. It resets on the 1st (UTC), or upgrade at ${KEY_URL}. ${err.message}`;
      case "rate_limited":
        return `Too many requests per minute for this yTranscript plan. Wait a minute and try again. ${err.message}`;
      case "no_transcript":
        return `No transcript is available for this video. It may be private, age-restricted, removed, or have no speech. ${err.message}`;
      case "bad_request":
        return `That doesn't look like a YouTube video. Pass a video URL (youtube.com/watch?v=..., youtu.be/..., /shorts/...) or an 11-character video ID. ${err.message}`;
      case "network_error":
        return `Couldn't reach the yTranscript API. Check the network connection and try again. ${err.message}`;
      default:
        return `yTranscript couldn't fetch this transcript. Try again in a minute. ${err.message}`;
    }
  }
  return `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
}
