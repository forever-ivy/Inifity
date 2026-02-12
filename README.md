# Translation Automation V4.1 (OpenClaw-First)

## What changed

V4.1 makes **OpenClaw the primary orchestrator**:

- Trigger sources:
  - Email (IMAP poll by OpenClaw cron)
  - WhatsApp inbound (message/file)
- Knowledge base:
  - Read-only source: `/Users/ivy/Library/CloudStorage/OneDrive-Personal/Knowledge Repository`
  - Incremental indexing: `mtime + hash`
  - Supported: `docx`, `pdf`, `md`, `txt`, `xlsx`, `csv`
- Work outputs:
  - `/Users/ivy/Library/CloudStorage/OneDrive-Personal/Translation Task`
- Notifications:
  - Milestone WhatsApp messages
  - Pending reminders twice daily
- Approval:
  - WhatsApp commands: `status|approve|reject|rerun`

`n8n` legacy workflows have been removed from this repository.

## Directory roles

- Knowledge source root: `/Users/ivy/Library/CloudStorage/OneDrive-Personal/Knowledge Repository`
  - `Previously Translated`
  - `Glossery`
  - `Arabic Source`
  - `Translated -EN`
- Work root: `/Users/ivy/Library/CloudStorage/OneDrive-Personal/Translation Task`
  - `_INBOX/email/{job_id}`
  - `_INBOX/whatsapp/{job_id}`
  - `Translated -EN/_REVIEW/{job_id}`
  - `.system/jobs/state.sqlite`
  - `.system/kb/*`
  - `.system/logs/*`

## New V4.1 scripts

- Dispatcher:
  - `scripts/openclaw_v4_dispatcher.py`
- Skills:
  - `scripts/skill_email_ingest.py`
  - `scripts/skill_whatsapp_ingest.py`
  - `scripts/skill_kb_incremental_sync.py`
  - `scripts/skill_kb_retrieve.py`
  - `scripts/skill_task_router.py`
  - `scripts/skill_translation_execute.py`
  - `scripts/skill_approval.py`
  - `scripts/skill_notify.py`
  - `scripts/skill_pending_reminder.py`
- Runtime libs:
  - `scripts/v4_runtime.py`
  - `scripts/v4_kb.py`
  - `scripts/v4_pipeline.py`
- Setup:
  - `scripts/setup_openclaw_v4.sh`
  - `scripts/run_v4_email_poll.sh`
  - `scripts/run_v4_pending_reminder.sh`

## Install dependencies

```bash
cd /Users/Code/workflow/translation
/Users/Code/workflow/translation/.venv/bin/pip install -r requirements.txt
```

## Local env file for V4

Create `/Users/Code/workflow/translation/.env.v4.local`:

```bash
V4_WORK_ROOT="/Users/ivy/Library/CloudStorage/OneDrive-Personal/Translation Task"
V4_KB_ROOT="/Users/ivy/Library/CloudStorage/OneDrive-Personal/Knowledge Repository"
V4_PYTHON_BIN="/Users/Code/workflow/translation/.venv/bin/python"

OPENCLAW_NOTIFY_TARGET="+8615071054627"
OPENCLAW_NOTIFY_CHANNEL="whatsapp"
OPENCLAW_NOTIFY_ACCOUNT="default"

V4_IMAP_HOST="imap.your-provider.com"
V4_IMAP_PORT=993
V4_IMAP_USER="you@example.com"
V4_IMAP_PASSWORD="your_password_or_app_password"
V4_IMAP_MAILBOX="INBOX"
V4_IMAP_FROM_FILTER="modeh@eventranz.com"
V4_IMAP_MAX_MESSAGES=5
```

### Mailbox setup notes (163 mail)

- `V4_IMAP_HOST` use `imap.163.com`
- `V4_IMAP_PORT` use `993`
- `V4_IMAP_PASSWORD` must be 163 IMAP authorization code (not login password)
- Keep `V4_IMAP_FROM_FILTER="modeh@eventranz.com"` to only process boss emails

Quick test:

```bash
cd /Users/Code/workflow/translation
./scripts/run_v4_email_poll.sh
```

If the mailbox is configured correctly, output JSON contains `"ok": true`.

## OpenClaw setup (V4)

```bash
cd /Users/Code/workflow/translation
chmod +x scripts/setup_openclaw_v4.sh scripts/run_v4_email_poll.sh scripts/run_v4_pending_reminder.sh
./scripts/setup_openclaw_v4.sh
openclaw gateway --force
openclaw health --json
```

## Manual run commands

### 1) Poll email and auto-run jobs

```bash
cd /Users/Code/workflow/translation
./scripts/run_v4_email_poll.sh
```

### 2) Run pending reminders

```bash
cd /Users/Code/workflow/translation
./scripts/run_v4_pending_reminder.sh
```

### 3) Handle approval command directly

```bash
cd /Users/Code/workflow/translation
/Users/Code/workflow/translation/.venv/bin/python scripts/openclaw_v4_dispatcher.py \
  approval --command "approve job_xxx"
```

## WhatsApp command interface

- `status {job_id}`
- `approve {job_id}`
- `reject {job_id} {reason}`
- `rerun {job_id}`

## Key runtime outputs per job

`/Users/ivy/Library/CloudStorage/OneDrive-Personal/Translation Task/Translated -EN/_REVIEW/{job_id}`

- `Draft A (Preserve).docx`
- `Draft B (Reflow).docx`
- `Review Brief.docx`
- `.system/Task Brief.md`
- `.system/Delta Summary.json`
- `.system/Model Scores.json`
- `.system/quality_report.json`
- `.system/openclaw_result.json`
- `.system/execution_plan.json`

## Tests

```bash
cd /Users/Code/workflow/translation
PYTHONPATH=/Users/Code/workflow/translation /Users/Code/workflow/translation/.venv/bin/python -m unittest discover -s tests -v
```

## Schemas (V4)

- `schemas/job_envelope_v4.schema.json`
- `schemas/knowledge_sync_record.schema.json`
- `schemas/execution_plan_v4.schema.json`
- `schemas/execution_result_v4.schema.json`
- `schemas/notification_event_v4.schema.json`
