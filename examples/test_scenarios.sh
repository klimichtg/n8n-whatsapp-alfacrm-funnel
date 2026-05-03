#!/usr/bin/env bash
# 5 готовых сценариев для проверки воронки end-to-end.
# Запускать из корня репо. Workflow должен быть в режиме "Listen for test event"
# или Active с production webhook URL.
#
# Usage:
#   WEBHOOK_URL=http://localhost:5678/webhook/evolution-incoming ./examples/test_scenarios.sh

set -euo pipefail
URL="${WEBHOOK_URL:-http://localhost:5678/webhook/evolution-incoming}"

scenario() {
  echo
  echo "=== $1 ==="
  curl -sS -X POST "$URL" -H 'Content-Type: application/json' -d "$2" | jq -c .
  sleep 1
}

# 1. Новый лид с тёплым запросом (B2C образование)
scenario "Новый лид — спрашивает про курс" '{
  "event":"messages.upsert",
  "instance":"sales-bot-1",
  "data":{
    "key":{"remoteJid":"79161234567@s.whatsapp.net","fromMe":false,"id":"MSG-001"},
    "pushName":"Иван Петров",
    "messageTimestamp":1730635200,
    "message":{"conversation":"Здравствуйте, расскажите про курс английского для ребёнка 8 лет"},
    "messageType":"conversation"
  }
}'

# 2. Возвращающийся клиент (тот же phone, продолжает диалог) — должен подтянуться контекст
scenario "Возвращающийся клиент — уточняет цену" '{
  "event":"messages.upsert",
  "instance":"sales-bot-1",
  "data":{
    "key":{"remoteJid":"79161234567@s.whatsapp.net","fromMe":false,"id":"MSG-002"},
    "pushName":"Иван Петров",
    "messageTimestamp":1730635260,
    "message":{"conversation":"А сколько это стоит в месяц?"},
    "messageType":"conversation"
  }
}'

# 3. Горячий лид — явный сигнал к покупке (action=handoff ожидается)
scenario "Горячий лид — готов оплатить" '{
  "event":"messages.upsert",
  "instance":"sales-bot-1",
  "data":{
    "key":{"remoteJid":"79161234567@s.whatsapp.net","fromMe":false,"id":"MSG-003"},
    "pushName":"Иван Петров",
    "messageTimestamp":1730635320,
    "message":{"conversation":"Окей, готов оплатить на месяц вперёд, куда переводить?"},
    "messageType":"conversation"
  }
}'

# 4. Холодный/мусорный лид — должен попасть в стадию 5
scenario "Не целевой лид — спрашивает про другое" '{
  "event":"messages.upsert",
  "instance":"sales-bot-1",
  "data":{
    "key":{"remoteJid":"79169998877@s.whatsapp.net","fromMe":false,"id":"MSG-004"},
    "pushName":"Случайный",
    "messageTimestamp":1730635380,
    "message":{"conversation":"А вы продаёте кальяны?"},
    "messageType":"conversation"
  }
}'

# 5. Групповое сообщение — должно быть отфильтровано (не воронка)
scenario "Групповой чат — должен быть проигнорирован" '{
  "event":"messages.upsert",
  "instance":"sales-bot-1",
  "data":{
    "key":{"remoteJid":"123456789@g.us","fromMe":false,"id":"MSG-005"},
    "pushName":"Группа",
    "messageTimestamp":1730635440,
    "message":{"conversation":"Всем привет"},
    "messageType":"conversation"
  }
}'

echo
echo "=== Готово. Проверьте Executions в n8n UI и AlfaCRM. ==="
