# Security Rotation Checklist (Required)

Complete before enabling V4.1 in production.

## 1) Rotate model/provider keys

- [ ] Gemini key
- [ ] DeepSeek key
- [ ] OpenAI key (if used)
- [ ] Claude key (if used)
- [ ] GLM key (if used)
- [ ] MiniMax key (if used)
- [ ] Kimi key (if used)
- [ ] OpenRouter key (if used)

## 2) Rotate OpenClaw tokens

- [ ] Rotate `gateway.auth.token`
- [ ] Set dedicated `hooks.token` (must not equal gateway token)

## 3) Tighten exposure

- [ ] Keep gateway bind on loopback for local-only mode
- [ ] Keep tailscale/public exposure disabled unless explicitly needed

## 4) Env hygiene

- [ ] Remove any legacy `.env` files with tokens from version control (keep only local `.env.v4.local`)
- [ ] Keep provider keys only in OpenClaw profile/runtime
- [ ] Keep IMAP password only in local `.env.v4.local` (never commit)
- [ ] Ensure `.env.v4.local` is not shared publicly

## 5) Verify after rotation

- [ ] `openclaw health --json` returns `ok: true`
- [ ] Telegram bot can receive + send a test message (direct mode if enabled)
- [ ] Email poll runner executes without exposing secrets in logs
- [ ] `openclaw_result.json` is generated for a sample job
