# Implementation Notes (V4.1)

## Architecture pivot

V4.1 shifts from `n8n-main` to `OpenClaw-main` orchestration:

1. OpenClaw handles:
   - email ingest
   - WhatsApp ingest
   - knowledge-base sync/retrieve
   - task routing
   - translation execution
   - approval commands
   - pending reminders
2. n8n workflows are removed from repository in V4.1.

## Paths

- Knowledge source (read-only):
  - `/Users/ivy/Library/CloudStorage/OneDrive-Personal/Knowledge Repository`
- Work root:
  - `/Users/ivy/Library/CloudStorage/OneDrive-Personal/Translation Task`

## Core behavior

1. Pre-execution KB sync:
   - mtime + sha256 incremental update
   - formats: docx/pdf/md/txt/xlsx/csv
2. Task planning:
   - classify into `REVISION_UPDATE|NEW_TRANSLATION|BILINGUAL_REVIEW|EN_ONLY_EDIT|MULTI_FILE_BATCH`
   - estimate runtime and cap via `min(estimated * 1.3, 45)`
3. Translation self-check:
   - Codex + Gemini
   - max rounds = 3
4. Delivery gate:
   - `approve {job_id}` requires `*_manual*.docx` or `*_edited*.docx`
5. Notifications:
   - milestone WhatsApp notifications
   - pending reminders twice daily

## Added scripts (V4.1)

- `/Users/Code/workflow/translation/scripts/openclaw_v4_dispatcher.py`
- `/Users/Code/workflow/translation/scripts/v4_runtime.py`
- `/Users/Code/workflow/translation/scripts/v4_kb.py`
- `/Users/Code/workflow/translation/scripts/v4_pipeline.py`
- `/Users/Code/workflow/translation/scripts/skill_email_ingest.py`
- `/Users/Code/workflow/translation/scripts/skill_whatsapp_ingest.py`
- `/Users/Code/workflow/translation/scripts/skill_kb_incremental_sync.py`
- `/Users/Code/workflow/translation/scripts/skill_kb_retrieve.py`
- `/Users/Code/workflow/translation/scripts/skill_task_router.py`
- `/Users/Code/workflow/translation/scripts/skill_translation_execute.py`
- `/Users/Code/workflow/translation/scripts/skill_approval.py`
- `/Users/Code/workflow/translation/scripts/skill_notify.py`
- `/Users/Code/workflow/translation/scripts/skill_pending_reminder.py`
- `/Users/Code/workflow/translation/scripts/run_v4_email_poll.sh`
- `/Users/Code/workflow/translation/scripts/run_v4_pending_reminder.sh`
- `/Users/Code/workflow/translation/scripts/setup_openclaw_v4.sh`

## Added schemas (V4)

- `/Users/Code/workflow/translation/schemas/job_envelope_v4.schema.json`
- `/Users/Code/workflow/translation/schemas/knowledge_sync_record.schema.json`
- `/Users/Code/workflow/translation/schemas/execution_plan_v4.schema.json`
- `/Users/Code/workflow/translation/schemas/execution_result_v4.schema.json`
- `/Users/Code/workflow/translation/schemas/notification_event_v4.schema.json`

## Runtime state

SQLite state:
- `/Users/ivy/Library/CloudStorage/OneDrive-Personal/Translation Task/.system/jobs/state.sqlite`

Logs:
- `/Users/ivy/Library/CloudStorage/OneDrive-Personal/Translation Task/.system/logs/events.log`
- `/Users/ivy/Library/CloudStorage/OneDrive-Personal/Translation Task/.system/logs/errors.log`

## Notes

1. V4 setup script configures OpenClaw agents + cron jobs.
2. Email credentials are intentionally stored in local `.env.v4.local` (not in repo).
3. WhatsApp must stay online for command loop (`status/approve/reject/rerun`).
