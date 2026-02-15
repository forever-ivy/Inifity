# Credentials Map (V4.1 OpenClaw-First)

## Primary runtime

V4.1 uses OpenClaw as the primary orchestrator.  
Secrets should be in local env/runtime config, not in repo.

## Local env file (recommended)

Create:
- `/Users/Code/workflow/translation/.env.v4.local`

Required keys:
- `V4_IMAP_HOST`
- `V4_IMAP_USER`
- `V4_IMAP_PASSWORD`
- `OPENCLAW_NOTIFY_TARGET`

Optional:
- `V4_IMAP_PORT` (default `993`)
- `V4_IMAP_MAILBOX` (default `INBOX`)
- `V4_IMAP_FROM_FILTER` (default `modeh@eventranz.com`)
- `V4_IMAP_MAX_MESSAGES` (default `5`)
- `V4_WORK_ROOT`
- `V4_KB_ROOT`
- `V4_PYTHON_BIN`

## OpenClaw auth/providers

Configure provider auth inside OpenClaw profile:
- `openai-codex` (primary)
- `google-antigravity` / Gemini (fallback/reviewer)

## Telegram

Inbound tasks are received via the standalone Telegram bot (`scripts/telegram_bot.py`).

Outbound notifications use:
- `OPENCLAW_NOTIFY_CHANNEL=telegram`
- Optional direct send: `TELEGRAM_DIRECT_MODE=1` + `TELEGRAM_BOT_TOKEN`

Check:
```bash
openclaw health --json
```

No n8n credential mapping is required in V4.1.
