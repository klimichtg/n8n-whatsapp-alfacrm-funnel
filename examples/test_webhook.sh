#!/usr/bin/env bash
# Локальный smoke-тест: отправляем имитацию payload Evolution API в n8n webhook.
# Если main workflow активен (или открыт в редакторе с "Listen for test event"),
# поток пройдёт по всей цепочке: AlfaCRM auth -> find/create -> AI agent -> reply -> stage update.

URL="${WEBHOOK_URL:-http://localhost:5678/webhook/evolution-incoming}"

curl -sS -X POST "$URL" \
  -H 'Content-Type: application/json' \
  --data-binary @"$(dirname "$0")/evolution_messages_upsert.json" | jq .
