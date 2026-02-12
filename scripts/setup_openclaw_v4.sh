#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/Users/Code/workflow/translation"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-$ROOT_DIR}"
PRIMARY_MODEL="${OPENCLAW_PRIMARY_MODEL:-openai-codex/gpt-5.3-codex}"
FALLBACK_MODEL="${OPENCLAW_FALLBACK_MODEL:-google/gemini-2.5-pro}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required" >&2
  exit 2
fi

ensure_agent() {
  local agent_id="$1"
  local model_id="$2"
  if openclaw agents list --json 2>/dev/null | jq -e --arg id "$agent_id" '.[] | select(.id == $id)' >/dev/null; then
    echo "Agent exists: $agent_id"
    return 0
  fi
  openclaw agents add "$agent_id" \
    --non-interactive \
    --workspace "$WORKSPACE_DIR" \
    --model "$model_id" \
    --json >/dev/null
  echo "Agent created: $agent_id"
}

upsert_cron_job() {
  local name="$1"
  shift
  local existing
  existing="$(openclaw cron list --json 2>/dev/null | jq -r --arg n "$name" '.items[]? | select(.name==$n) | .id' | head -n1 || true)"
  if [[ -n "$existing" ]]; then
    openclaw cron rm --id "$existing" --json >/dev/null || true
  fi
  openclaw cron add --name "$name" "$@" --json >/dev/null
  echo "Cron configured: $name"
}

echo "Ensuring V4 agents..."
ensure_agent "task-router" "$PRIMARY_MODEL"
ensure_agent "translator-core" "$PRIMARY_MODEL"
ensure_agent "review-core" "$FALLBACK_MODEL"
ensure_agent "qa-gate" "$PRIMARY_MODEL"

echo "Configuring model routing..."
openclaw models set "$PRIMARY_MODEL"
openclaw models fallbacks clear || true
openclaw models fallbacks add "$FALLBACK_MODEL" || true

EMAIL_CMD="Execute this shell command exactly once and return only a short status JSON: cd $ROOT_DIR && ./scripts/run_v4_email_poll.sh"
REMINDER_CMD="Execute this shell command exactly once and return only a short status JSON: cd $ROOT_DIR && ./scripts/run_v4_pending_reminder.sh"

echo "Configuring OpenClaw cron jobs..."
upsert_cron_job "v4-email-poll" \
  --agent "task-router" \
  --every "2m" \
  --message "$EMAIL_CMD" \
  --wake "now" \
  --timeout-seconds "120"

upsert_cron_job "v4-pending-reminder-am" \
  --agent "task-router" \
  --cron "0 9 * * *" \
  --tz "${OPENCLAW_CRON_TZ:-Asia/Shanghai}" \
  --message "$REMINDER_CMD" \
  --wake "now" \
  --timeout-seconds "120"

upsert_cron_job "v4-pending-reminder-pm" \
  --agent "task-router" \
  --cron "0 19 * * *" \
  --tz "${OPENCLAW_CRON_TZ:-Asia/Shanghai}" \
  --message "$REMINDER_CMD" \
  --wake "now" \
  --timeout-seconds "120"

echo
echo "V4 setup complete."
echo "Next:"
echo "1) Create $ROOT_DIR/.env.v4.local with IMAP credentials."
echo "2) chmod +x scripts/run_v4_email_poll.sh scripts/run_v4_pending_reminder.sh scripts/setup_openclaw_v4.sh"
echo "3) Restart gateway: openclaw gateway --force"
echo "4) Check health: openclaw health --json"
