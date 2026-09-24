import { describe, it, expect } from "vitest";
import { YTranscriptError, type Transcript } from "ytranscript-api";
import { formatTimestamp, renderTranscript, renderQuota, explainError } from "../src/format.js";

const t: Transcript = {
  videoId: "dQw4w9WgXcQ",
  lang: "en",
  whisper: false,
  cached: false,
  unitsCharged: 1,
  segments: [
    { text: "hello  there", offset: 0, duration: 1000 },
    { text: "general kenobi", offset: 61_000, duration: 1000 },
    { text: "you are a bold one", offset: 3_661_000, duration: 1000 },
  ],
  text: "hello there general kenobi you are a bold one",
};

describe("formatTimestamp", () => {
  it("uses m:ss under an hour and h:mm:ss above", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(61_000)).toBe("1:01");
    expect(formatTimestamp(3_661_000)).toBe("1:01:01");
    expect(formatTimestamp(-5)).toBe("0:00");
  });
});

describe("renderTranscript", () => {
  it("text format: header plus one normalized block", () => {
    const out = renderTranscript(t);
    expect(out).toContain("https://youtu.be/dQw4w9WgXcQ");
    expect(out).toContain("language: en");
    expect(out).toContain("source: YouTube captions");
    expect(out).toContain("hello there general kenobi you are a bold one");
    expect(out).not.toContain("[0:00]");
  });

  it("timestamped format: one line per segment", () => {
    const out = renderTranscript(t, { format: "timestamped" });
    expect(out).toContain("[0:00] hello  there\n[1:01] general kenobi\n[1:01:01] you are a bold one");
  });

  it("labels AI speech-to-text results", () => {
    expect(renderTranscript({ ...t, whisper: true })).toContain("AI speech-to-text");
  });

  it("truncates on a word boundary and says how much was cut", () => {
    const out = renderTranscript(t, { maxCharacters: 20 });
    expect(out).toContain("hello there general");
    expect(out).not.toContain("kenobi you");
    expect(out).toMatch(/\[Truncated: showing 19 of 45 characters\./);
  });

  it("does not truncate when the body fits", () => {
    expect(renderTranscript(t, { maxCharacters: 10_000 })).not.toContain("Truncated");
  });

  it("appends quota usage when known", () => {
    const out = renderTranscript(t, { quota: { limit: 1000, used: 42, rateLimitRemaining: 29 } });
    expect(out).toContain("this request used 1 unit; 42 of 1,000 units used this month");
  });
});

describe("renderQuota", () => {
  it("is empty without quota info and pluralizes units", () => {
    expect(renderQuota({ unitsCharged: 1 }, null)).toBe("");
    expect(renderQuota({ unitsCharged: 15 }, { limit: 50, used: 15, rateLimitRemaining: 9 })).toContain("used 15 units");
  });
});

describe("explainError", () => {
  it("gives an actionable message for each API error code", () => {
    const e = (code: ConstructorParameters<typeof YTranscriptError>[0]) => explainError(new YTranscriptError(code, 400, "detail"));
    expect(e("unauthorized")).toContain("YTRANSCRIPT_API_KEY");
    expect(e("unauthorized")).toContain("https://ytranscript.com/developers");
    expect(e("quota_exceeded")).toContain("resets on the 1st");
    expect(e("rate_limited")).toContain("Wait a minute");
    expect(e("no_transcript")).toContain("No transcript is available");
    expect(e("bad_request")).toContain("11-character video ID");
    expect(e("network_error")).toContain("Couldn't reach");
    expect(e("fetch_failed")).toContain("Try again");
  });

  it("handles non-API errors", () => {
    expect(explainError(new Error("boom"))).toBe("Unexpected error: boom");
    expect(explainError("x")).toBe("Unexpected error: x");
  });
});
