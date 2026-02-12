# Security Rotation Checklist (Required)

Complete before enabling V2 in production.

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

- [ ] Remove model keys from n8n `.env`
- [ ] Keep provider keys only in OpenClaw profile/runtime
- [ ] Ensure `.env` is not shared publicly

## 5) Verify after rotation

- [ ] `openclaw health --json` returns `ok: true`
- [ ] n8n hook call returns `202` with `runId`
- [ ] `openclaw_result.json` is generated for a sample job
