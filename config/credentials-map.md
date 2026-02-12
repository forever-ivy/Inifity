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

## WhatsApp

OpenClaw WhatsApp channel must be:
- configured
- linked
- running + connected

Check:
```bash
openclaw health --json
```

## Legacy (V2 n8n)

If you rollback to V2 workflows, n8n credentials are still:
- `cred_imap`
- `cred_onedrive`
- `cred_whatsapp`
