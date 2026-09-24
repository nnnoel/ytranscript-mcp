# Changelog

## 0.1.0

- First release: the `get_transcript` tool accepts a URL or video ID, an optional `lang`, `text` or `timestamped` format, and `max_characters`.
- Errors come back as clear, actionable messages: missing key, quota used up, rate limited, no transcript, invalid input, network.
- The server starts and lists its tools without an API key, and explains how to get one when a tool is called.
