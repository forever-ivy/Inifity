#!/usr/bin/env bash
set -euo pipefail
cd /Users/Code/workflow/translation
set -a
source .env.v4.local
set +a
exec .venv/bin/python -m scripts.telegram_bot
