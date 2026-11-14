/**
 * Pure formatting helpers: turn API results and errors into text an AI assistant can use.
 * No I/O here, so everything in this file is unit-tested.
 */
import type { Transcript, VideoMetadata, QuotaInfo } from "ytranscript-api";
import { YTranscriptError } from "ytranscript-api";

export type TranscriptFormat = "text" | "timestamped";

// Tagged so visits that start from a message inside an AI client (which sends no referrer) can be told apart.
export const KEY_URL = "https://ytranscript.com/developers?utm_source=mcp-server";

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
  const header =
    `Transcript of https://youtu.be/${t.videoId} (language: ${t.lang}, source: ${source})` +
    (t.metadata ? `\n${renderVideoFacts(t.metadata).join("\n")}` : "");

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

const count = (x: number) => x.toLocaleString("en-US");

/** One "Label: value" line per fact YouTube returned; unknown facts are left out. */
function renderVideoFacts(v: VideoMetadata): string[] {
  const lines = [`Title: ${v.title}`];
  const ch = v.channel;
  if (ch.name || ch.handle) {
    const extras = [
      ch.name && ch.handle ? ch.handle : null,
      ch.subscriberCount != null ? `about ${count(ch.subscriberCount)} subscribers` : null,
    ].filter(Boolean);
    lines.push(`Channel: ${ch.name ?? ch.handle}${extras.length ? ` (${extras.join(", ")})` : ""}`);
  }
  if (v.publishedAt) lines.push(`Published: ${v.publishedAt.slice(0, 10)}`);
  if (v.durationSeconds != null) lines.push(`Duration: ${formatTimestamp(v.durationSeconds * 1000)}`);
  if (v.viewCount != null) lines.push(`Views: ${count(v.viewCount)}`);
  if (v.likeCount != null) lines.push(`Likes: ${count(v.likeCount)}`);
  if (v.category) lines.push(`Category: ${v.category}`);
  if (v.isLive) lines.push("Live: yes");
  return lines;
}

/** Full video details for the get_video_info tool. */
export function renderVideoInfo(v: VideoMetadata & { unitsCharged: number }, quota?: QuotaInfo | null): string {
  const parts = [[`Video https://youtu.be/${v.videoId}`, ...renderVideoFacts(v)].join("\n")];
  if (v.channel.url) parts[0] += `\nChannel URL: ${v.channel.url}`;
  if (v.tags?.length) parts[0] += `\nTags: ${v.tags.join(", ")}`;
  if (v.chapters.length) {
    parts.push(`Chapters:\n${v.chapters.map((c) => `[${formatTimestamp(c.startSeconds * 1000)}] ${c.title}`).join("\n")}`);
  }
  if (v.description) parts.push(`Description:\n${v.description}`);
  // YouTube sometimes serves the API a reduced page; say so instead of leaving silent gaps.
  if (v.durationSeconds == null && v.tags == null && v.category == null) {
    parts.push("[YouTube limited what it showed for this video, so duration, tags and category are missing. They are usually back within a few minutes.]");
  }
  return `${parts.join("\n\n")}${renderQuota(v, quota)}`;
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
        return `The monthly yTranscript quota is used up. It resets on the 1st (UTC). To get more units now, go to ${KEY_URL} and upgrade or buy a pack. ${err.message}`;
      case "rate_limited":
        return `Too many requests per minute for this yTranscript plan. Wait a minute and try again. ${err.message}`;
      case "not_found":
        return `This video doesn't exist, or it is private or has been removed. ${err.message}`;
      case "temporarily_unavailable": {
        const wait = err.retryAfterSeconds ? `in about ${err.retryAfterSeconds} seconds` : "in a few minutes";
        return `YouTube is temporarily blocking yTranscript's servers, so this video can't be fetched right now. Nothing was charged. Try again ${wait}. ${err.message}`;
      }
      case "no_transcript":
        return `No transcript is available for this video. It may be private, age-restricted, removed, or have no speech. ${err.message}`;
      case "bad_request":
        return `That doesn't look like a YouTube video. Pass a video URL (youtube.com/watch?v=..., youtu.be/..., /shorts/...) or an 11-character video ID. ${err.message}`;
      case "network_error":
        return `Couldn't reach the yTranscript API. Check the network connection and try again. ${err.message}`;
      default:
        return `yTranscript couldn't complete this request. Try again in a minute. ${err.message}`;
    }
  }
  return `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
}
