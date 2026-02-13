# Implementation Notes (V6.0)

## Core changes from V5.3

1. Command protocol is now strict `new -> (send text/files) -> run`.
2. Added `new` command handling in approval/ingest/router paths.
3. Sender can no longer accidentally run without active collecting job when `OPENCLAW_REQUIRE_NEW=1`.
4. Pre-run pipeline remains enforced:
   - `kb_sync_incremental`
   - `kb_retrieve`
5. Knowledge retrieval backend updated:
   - primary: `clawrag`
   - fallback: local sqlite KB retrieval (`rag_fallback_local` flag)
6. Execution uses real Codex + Gemini 3-round loop:
   - Codex draft
   - Gemini review
   - Codex revision
   - Gemini re-review
7. Output path is `_VERIFY/{job_id}` only.
8. `ok` is still status-only (`verified`), no auto-delivery copy.
9. Contextual command interface:
   - `new | run | status | ok | no {reason} | rerun`
10. Sender-active-job mapping remains persisted in SQLite.
11. WhatsApp strict router mode remains:
   - route inbound task messages to dispatcher, not free-form chat
   - extract `[media attached: ...]` local file paths
   - strip inline `<file ...>` blocks to reduce token pressure
12. Translation model calls enforce `--thinking high` by default:
   - env override: `OPENCLAW_TRANSLATION_THINKING`
13. Execution metadata includes:
   - `thinking_level`
   - `router_mode`
   - `token_guard_applied`
   - `knowledge_backend`
14. Added spreadsheet-aware execution:
   - task type `SPREADSHEET_TRANSLATION`
   - optional output `Final.xlsx`
15. Setup script now installs pinned first-batch community skills from:
   - `config/skill-lock.v6.json`
16. Cron jobs continue to use `--no-deliver` to avoid noisy delivery-target errors.

## First-batch skill lock

Pinned in `config/skill-lock.v6.json`:

- `himalaya@1.0.0`
- `openclaw-mem@2.1.0`
- `memory-hygiene@1.0.0`
- `sheetsmith@1.0.1`
- `pdf-extract@1.0.0`
- `docx-skill@1.0.2` (optional)
- `clawrag@1.2.0`

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
- Enforce strict `new` flow while preserving per-sender continuity.

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

## User-facing status format

`status` now returns a 6-line card:

1. Job
2. Stage
3. Task + language pair
4. Input readiness
5. Round progress + double pass
6. Next command

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
