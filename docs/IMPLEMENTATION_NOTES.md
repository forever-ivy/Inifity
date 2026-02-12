# Implementation Notes (V2)

## Summary

V2 shifts model orchestration from n8n to OpenClaw.

- n8n handles: triggers, routing, review gate, delivery, notifications.
- OpenClaw handles: translation intelligence, quality gate, artifact generation.

## What changed

1. Added V2 workflows:
   - `WF-00-Orchestrator-V2`
   - `WF-20-OpenClaw-Orchestrator-V2`
   - `WF-30-Manual-Review-Deliver-V2`
   - `WF-99-Error-Audit-V2`
2. Reused `WF-10-Ingest-Classify`.
3. Added OpenClaw scripts:
   - `openclaw_translation_orchestrator.py`
   - `openclaw_quality_gate.py`
   - `openclaw_artifact_writer.py`
4. Removed model API keys from n8n env contract.
5. Added OpenClaw setup helper: `scripts/setup_openclaw_v2.sh`.
6. Setup helper now bootstraps required agents:
   - `translator-main`
   - `translator-diff`
   - `translator-draft`
   - `translator-qa`

## Interface contract

### n8n -> OpenClaw

`POST {OPENCLAW_BASE_URL}/hooks/agent`

Headers:

- `Authorization: Bearer {OPENCLAW_HOOK_TOKEN}`

Payload includes:

- `message` with command to execute orchestrator script
- `agentId`
- `sessionKey`
- `deliver=false`
- `meta` (`job_id`, 3 input paths, `review_dir`)

### OpenClaw -> n8n (filesystem contract)

OpenClaw writes result file:

- `{review_dir}/openclaw_result.json`

n8n polls this file and validates `ok=true` before opening review gate.

### Hook ACK behavior

- `/hooks/agent` returns async ACK (`202` + `runId`) in this OpenClaw version.
- n8n does not wait for final payload from HTTP response body.
- n8n waits for `openclaw_result.json` and treats that file as `HookTaskResponse`.

## Compatibility notes

- In OpenClaw 2026.2.9, `hooks.allowedAgentIds` may not be supported by config schema.
- Enforce allowed agent behavior via payload (`agentId=translator-main`) and script-side checks.

## Release plan

- Keep legacy V1 workflows for rollback.
- Activate V2 workflows only after credentials + hook config + 3 successful task runs.
- Dedup in V2 uses `event_hash + file_fingerprint`.

## Required manual actions

1. Rotate leaked API keys and gateway/hook tokens.
2. Configure OpenClaw hooks and fallback chain.
3. Import V2 workflows and set `WF*_V2_WORKFLOW_ID` env variables.
4. Verify end-to-end with a test job.
