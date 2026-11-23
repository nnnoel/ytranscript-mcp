# Changelog

## 0.4.0

- `get_transcript` with a `lang` the video has no captions in now gets an AI transcription in the language actually spoken, instead of an error. If AI transcription can't run (for example `max_units` is too low), it returns the video's default captions with a "Note:" line saying why.
- Requires `ytranscript-api` 0.4.0.

## 0.3.0

- New `max_units` argument on `get_transcript`: the most a request may cost. A video without captions whose AI transcription would cost more isn't transcribed or charged, and the error gives the estimate. `max_units: 1` means captions only.
- AI transcription of videos without captions now costs 1 unit per minute of audio (at least 5) instead of a flat 15. The README's pricing section says so.
- Requires `ytranscript-api` 0.3.0.

## 0.2.1

- The message for a missing, private or removed video no longer says the same thing twice, and now says that nothing was charged.
- Releases are now published from GitHub Actions, so each version on npm carries a provenance statement linking it to the commit it was built from.

## 0.2.0

- New tool `get_video_info`: title, description, channel, publish date, duration, views, likes, tags, category and chapters for 1 unit.
- New `include_video_info` argument on `get_transcript`: the title, channel, publish date, duration and view count above the transcript, at no extra cost.
- Clear messages for two more errors: YouTube temporarily blocking the API (says when to retry, and that nothing was charged) and a video that doesn't exist.
- Requests now wait up to 5 minutes instead of 2, so AI transcription of a long video is not cut off.

## 0.1.1

- Links to the developer page in tool messages and the README carry a source tag.
- The quota message now mentions pay-as-you-go packs.

## 0.1.0

- First release: the `get_transcript` tool accepts a URL or video ID, an optional `lang`, `text` or `timestamped` format, and `max_characters`.
- Errors come back as clear, actionable messages: missing key, quota used up, rate limited, no transcript, invalid input, network.
- The server starts and lists its tools without an API key, and explains how to get one when a tool is called.
