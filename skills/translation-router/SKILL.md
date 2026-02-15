---
name: translation-router
description: V6.0 translation pipeline router with integrated community skill tools.
version: 3.0.0
---

# Translation Router (V6.0)

Route Telegram and email translation tasks into the local V6 pipeline. Never translate in chat.

## Entry Points

- **Telegram**: `telegram_bot.py` long-polls Bot API directly (TELEGRAM_DIRECT_MODE=1). Commands and files dispatch through `skill_message_router` → `openclaw_v4_dispatcher`.
- **Email**: `skill_email_ingest.py` polls IMAP, creates jobs from attachments.

## Command Protocol (Strict)

```
new → (send files/text) → run → (pick company: reply number) → system processes → (upload FINAL files) → ok / no {reason} / rerun
```

Other commands: `status`.

When `OPENCLAW_REQUIRE_NEW=1`, `run` before `new` is rejected.

## Routing Rule

For any inbound Telegram message, run exactly one shell command:

```bash
/Users/Code/workflow/translation/.venv/bin/python -m scripts.skill_message_router \
  --work-root "/Users/ivy/Library/CloudStorage/OneDrive-Personal/Translation Task" \
  --kb-root "/Users/ivy/Library/CloudStorage/OneDrive-Personal/Knowledge Repository" \
  --notify-target "<CHAT_ID>" --raw-text "<RAW_MESSAGE>"
```

- Never ask for files if attachments were already present.
- Never echo `<file ...>` blocks or binary payload content.
- Return one short status line only.

## Available Skill Tools

Agents in the translation pipeline can use these tools during execution rounds:

### pdf-extract (pdftotext)

Extract text from Arabic PDFs with layout preservation. Used automatically by `v4_kb.py` when indexing PDF files.

```bash
/opt/homebrew/bin/pdftotext -layout <input.pdf> -
```

### sheetsmith

Extract and preview spreadsheet data. Used automatically by `v4_kb.py` when indexing .xlsx files.

```bash
python ~/.openclaw/workspace/skills/sheetsmith/scripts/sheetsmith.py preview <input.xlsx> --rows 9999
```

### openclaw-mem

Cross-job memory for terminology decisions and translation patterns. Indexed with `gemini-embedding-001`.

```bash
# Recall prior decisions
openclaw memory search "<query>" --max-results 5 --json

# Store a new decision
openclaw memory store "<text>"
```

Used by `v4_pipeline.py` to recall context before translation and store decisions after successful jobs.

## Pipeline Flow

1. Job creation → SQLite state
2. KB sync (local + ClawRAG vector store)
3. KB retrieval (ClawRAG first, local fallback)
4. Cross-job memory recall (openclaw-mem)
5. Intent classification (Codex agent, plan_only=True)
6. Translation execution (up to 3 rounds Codex + Gemini review)
7. Cross-job memory store (on success)
8. Artifact writing → `_VERIFY/{job_id}`
9. Quality gate evaluation

## Translation Rules for Agents

- Preserve document structure first.
- Keep unmodified content verbatim.
- Target language purity required (no source language leakage).
- Manual delivery only — system writes to `_VERIFY/`, user moves to final.
- Consult `cross_job_memories` in execution context for prior terminology decisions.
