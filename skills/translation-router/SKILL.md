---
name: translation-router
description: Strict router for Telegram translation tasks. Always dispatch to local V6 pipeline instead of chatting.
version: 2.0.0
---

# Translation Router (Strict Mode)

Use this skill for incoming Telegram direct messages related to translation tasks.

## Goal

Route message + attachments into the local V6 pipeline. Do not perform translation in chat.

## Required behavior

1. For any relevant Telegram message, run exactly one shell command:

```bash
/Users/Code/workflow/translation/.venv/bin/python -m scripts.skill_message_router --work-root "/Users/ivy/Library/CloudStorage/OneDrive-Personal/Translation Task" --kb-root "/Users/ivy/Library/CloudStorage/OneDrive-Personal/Knowledge Repository" --notify-target "<CHAT_ID>" --raw-text "<RAW_MESSAGE>"
```

2. `<RAW_MESSAGE>` must be the full inbound message content.
3. Never ask for translation files in chat if they were already attached.
4. Never re-emit `<file ...>` blocks or binary-like payload text.
5. Do not run translation in this chat path. Router only.

## Command semantics

Supported command messages:

- `new`
- `run`
- `status`
- `ok`
- `no {reason}`
- `rerun`

For command-only messages, route directly to approval handler through the router script.

## Response style

- Return one short status line only.
- No long explanations.
- No duplicate confirmations.
- Default flow is mandatory: `new -> (send files/text) -> run`.
