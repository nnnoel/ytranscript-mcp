# ytranscript-mcp

An MCP server that gives Claude, Cursor, VS Code, and other AI tools the transcript of any YouTube video.

- **Works from anywhere.** Runs fine on AWS, Lambda, Vercel, n8n Cloud, and other cloud hosts. There are no proxies to buy and no IP bans to work around. YouTube blocks most cloud IPs for transcript requests; the [yTranscript API](https://ytranscript.com/developers) handles that for you.
- **Handles videos without captions.** If a video has no captions, it's transcribed with AI speech-to-text.
- **Returns the language actually spoken** by default, including on auto-dubbed videos. Pass `lang` to pick a specific caption track.
- **Keeps long videos manageable.** Choose plain text or timestamped lines, and cap the length so a two-hour video doesn't flood the model's context.

## Setup

1. Get a free API key at **[ytranscript.com/developers](https://ytranscript.com/developers)**. The free plan includes 50 units a month, no card required.
2. Add the server to your client using one of the configs below.

### Claude Code

```bash
claude mcp add ytranscript -e YTRANSCRIPT_API_KEY=yk_live_your_key -- npx -y ytranscript-mcp
```

### Claude Desktop

Add this to `claude_desktop_config.json`. Open it from **Settings → Developer → Edit Config**.

```json
{
  "mcpServers": {
    "ytranscript": {
      "command": "npx",
      "args": ["-y", "ytranscript-mcp"],
      "env": { "YTRANSCRIPT_API_KEY": "yk_live_your_key" }
    }
  }
}
```

### Cursor

Add this to `~/.cursor/mcp.json`, or to `.cursor/mcp.json` in a project:

```json
{
  "mcpServers": {
    "ytranscript": {
      "command": "npx",
      "args": ["-y", "ytranscript-mcp"],
      "env": { "YTRANSCRIPT_API_KEY": "yk_live_your_key" }
    }
  }
}
```

### VS Code

Add this to `.vscode/mcp.json`:

```json
{
  "servers": {
    "ytranscript": {
      "command": "npx",
      "args": ["-y", "ytranscript-mcp"],
      "env": { "YTRANSCRIPT_API_KEY": "yk_live_your_key" }
    }
  }
}
```

Any other MCP client that runs stdio servers works the same way: run `npx -y ytranscript-mcp` with `YTRANSCRIPT_API_KEY` set.

## Tool: `get_transcript`

| Argument | Required | Description |
|---|---|---|
| `video` | yes | A YouTube URL (`watch`, `youtu.be`, `shorts`, `embed`) or an 11-character video ID |
| `lang` | no | Language code of the caption track to fetch, such as `en` or `es`. Omit it to get the video's original language |
| `format` | no | `text` (default) returns plain text. `timestamped` returns one line per segment with `[m:ss]` times |
| `max_characters` | no | Cut the transcript at about this many characters. The response says how much was left out |

Things to ask your assistant:

- "Summarize this video: https://youtu.be/..."
- "What does the speaker say about pricing, and at what timestamps?"
- "Pull the transcript of this Spanish video and translate it to English."

Every response ends with the units used and your monthly total, so you can keep an eye on your quota.

## Pricing

A transcript from captions costs **1 unit**. A video without captions, transcribed with AI, costs **15 units**. Failed requests are free.

| Plan | Price | Units per month |
|---|---|---|
| Free | $0 | 50 |
| Starter | $9/mo | 1,000 |
| Developer | $29/mo | 10,000 |
| Scale | $79/mo | 50,000 |

See [ytranscript.com/developers](https://ytranscript.com/developers) for details.

## Related

- [`ytranscript-api`](https://www.npmjs.com/package/ytranscript-api) is the JavaScript/TypeScript client this server is built on.

## License

MIT
