# Changelog

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
