# Codex Feishu Bridge

Thin Feishu private-chat bridge for the official Codex CLI.

## What It Does

- Receives Feishu private-chat messages through a self-built Feishu bot.
- Sends each message to the local Codex CLI.
- Preserves one active Codex session per Feishu user.
- Supports `/new`, `/reset`, and `/status`.
- Handles basic inbound text, image, and file messages.
- Can return generated files when a Codex reply ends with `OUTPUT_IMAGE: <path>` or `OUTPUT_FILE: <path>`.

## Prerequisites

- Node.js 22+
- Official Codex CLI installed and logged in locally
- Feishu self-built bot app credentials
- Feishu app configured for long-connection event subscription

## Setup

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env`:

```dotenv
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CODEX_WORKSPACE=.
STATE_FILE=runtime/state.json
CODEX_TIMEOUT_MS=300000
```

Keep `.env` private. Do not commit real Feishu credentials.

## Commands

```powershell
npm test
npm start
npm run start:bg
npm run stop:bg
```

## Runtime Files

Runtime state is intentionally local-only:

- `runtime/bridge.pid`
- `runtime/bridge.out.log`
- `runtime/bridge.err.log`
- `runtime/state.json`
- `runtime/media/`

## Notes

- Only Feishu private chat is handled in v1.
- Replies are non-streaming for now: the bot sends a short processing ack first, then returns the full Codex reply.
- The default workspace is `CODEX_WORKSPACE`, then `CODEX_WORKSPACE_ROOT`, then the current working directory.
