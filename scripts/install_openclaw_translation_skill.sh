#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/Users/Code/workflow/translation"
SRC_SKILL_DIR="$ROOT_DIR/skills/translation-router"
DEST_SKILL_DIR="${OPENCLAW_WORKSPACE_SKILLS_DIR:-$HOME/.openclaw/workspace/skills}/translation-router"
ENV_FILE="$ROOT_DIR/.env.v4.local"
WORKSPACE_AGENTS_MD="${OPENCLAW_WORKSPACE_DIR:-$HOME/.openclaw/workspace}/AGENTS.md"

if [[ ! -f "$SRC_SKILL_DIR/SKILL.md" ]]; then
  echo "ERROR: source skill not found: $SRC_SKILL_DIR/SKILL.md" >&2
  exit 2
fi

mkdir -p "$DEST_SKILL_DIR"
cp "$SRC_SKILL_DIR/SKILL.md" "$DEST_SKILL_DIR/SKILL.md"
echo "Installed skill: $DEST_SKILL_DIR/SKILL.md"

if [[ -f "$WORKSPACE_AGENTS_MD" ]]; then
  tmp_file="$(mktemp)"
  awk '
    BEGIN {skip=0}
    /<!-- V5\.3_STRICT_ROUTER_BEGIN -->/ {skip=1; next}
    /<!-- V5\.3_STRICT_ROUTER_END -->/ {skip=0; next}
    skip==0 {print}
  ' "$WORKSPACE_AGENTS_MD" > "$tmp_file"
  cat >> "$tmp_file" <<'EOF'

<!-- V5.3_STRICT_ROUTER_BEGIN -->
## WhatsApp Strict Router (V5.3)

- For WhatsApp direct inbound task messages, do not translate in chat.
- Route immediately via:
  `/Users/Code/workflow/translation/.venv/bin/python -m scripts.skill_whatsapp_router --work-root "/Users/ivy/Library/CloudStorage/OneDrive-Personal/Translation Task" --kb-root "/Users/ivy/Library/CloudStorage/OneDrive-Personal/Knowledge Repository" --notify-target "+8615071054627" --raw-text "<RAW_MESSAGE>"`
- Allowed chat commands: `run`, `status`, `ok`, `no {reason}`, `rerun`.
- Never ask for files again if attachments were already present.
- Never echo inline `<file ...>` payload content.
<!-- V5.3_STRICT_ROUTER_END -->
EOF
  mv "$tmp_file" "$WORKSPACE_AGENTS_MD"
  echo "Patched strict-router rule into $WORKSPACE_AGENTS_MD"
fi

if [[ -f "$ENV_FILE" ]]; then
  if ! grep -q '^OPENCLAW_WA_STRICT_ROUTER=' "$ENV_FILE"; then
    echo 'OPENCLAW_WA_STRICT_ROUTER=1' >> "$ENV_FILE"
    echo "Added OPENCLAW_WA_STRICT_ROUTER=1 to $ENV_FILE"
  fi
  if ! grep -q '^OPENCLAW_TRANSLATION_THINKING=' "$ENV_FILE"; then
    echo 'OPENCLAW_TRANSLATION_THINKING=high' >> "$ENV_FILE"
    echo "Added OPENCLAW_TRANSLATION_THINKING=high to $ENV_FILE"
  fi
else
  cat >"$ENV_FILE" <<'EOF'
OPENCLAW_WA_STRICT_ROUTER=1
OPENCLAW_TRANSLATION_THINKING=high
EOF
  echo "Created $ENV_FILE with strict router + high reasoning defaults."
fi

if openclaw gateway restart >/dev/null 2>&1; then
  echo "OpenClaw gateway restarted (service mode)."
else
  echo "Gateway service restart unavailable, using foreground restart."
  openclaw gateway --force >/dev/null
  echo "OpenClaw gateway restarted (foreground mode)."
fi

echo "Verify:"
echo "  openclaw skills list | rg translation-router"
echo "  openclaw health --json"
