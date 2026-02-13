# Implementation Notes (V5.3)

## Core changes from V4.1

1. Intent classification is now LLM-first (`TaskIntentV5`) via OpenClaw agent.
2. Pre-run pipeline is enforced:
   - `kb_sync_incremental`
   - `kb_retrieve`
3. Execution uses real Codex + Gemini 3-round loop:
   - Codex draft
   - Gemini review
   - Codex revision
   - Gemini re-review
4. Output path is now `_VERIFY/{job_id}` only.
5. `ok` is status-only (`verified`), no auto-delivery copy.
6. Contextual command interface:
   - `run | status | ok | no {reason} | rerun`
7. Sender-active-job mapping is persisted in SQLite for no-arg command routing.
8. WhatsApp strict router mode added:
   - route inbound task messages to dispatcher, not free-form chat
   - extract `[media attached: ...]` local file paths
   - strip inline `<file ...>` blocks to reduce token pressure
9. Translation model calls now enforce `--thinking high` by default:
   - env override: `OPENCLAW_TRANSLATION_THINKING`
10. Execution metadata now includes:
   - `thinking_level`
   - `router_mode`
   - `token_guard_applied`
11. Cron jobs now use `--no-deliver` to remove noisy `delivery target missing` failures.

## State model

Main statuses:
- `received`
- `collecting`
- `running`
- `planned`
- `missing_inputs`
- `review_ready`
- `needs_attention`
- `needs_revision`
- `verified`
- `failed`

## Runtime DB additions

Table:
- `sender_active_jobs(sender, active_job_id, updated_at)`

Purpose:
- Resolve contextual commands without explicit `job_id`.

## Output bundle policy

Generated under:
- `/Users/ivy/Library/CloudStorage/OneDrive-Personal/Translation Task/Translated -EN/_VERIFY/{job_id}`

Never auto-copied to:
- `Translated -EN` root
- Knowledge Repository source tree

## Compatibility

Legacy command aliases remain:
- `approve` -> `ok`
- `reject` -> `no`

## Known tradeoff

The preserve-mode DOCX writer currently applies sequential text replacement into template paragraphs/cells to keep layout as much as possible. For heavily complex tables, final manual validation is still required (by design of V5.2 human-in-the-loop policy).

## New installer

Use:

- `/Users/Code/workflow/translation/scripts/install_openclaw_translation_skill.sh`

It will:

1. copy `skills/translation-router/SKILL.md` into OpenClaw workspace skills
2. patch OpenClaw workspace `AGENTS.md` with strict-router policy block
3. ensure `.env.v4.local` has strict-router + high-reasoning defaults
4. restart gateway
