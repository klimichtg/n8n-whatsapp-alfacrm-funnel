#!/usr/bin/env bash
# AlfaCRM auth: получаем X-ALFACRM-TOKEN (живёт 3600 сек).
# В n8n этот шаг — узел "AlfaCRM: Auth" (HTTP Request).
# В проде токен кэшируется в Redis с TTL=3500с, чтобы не упираться в лимит 5 req/sec.

: "${ALFACRM_HOSTNAME:?need hostname like demo.s20.online}"
: "${ALFACRM_EMAIL:?need email}"
: "${ALFACRM_API_KEY:?need api_key}"

curl -sS -X POST "https://${ALFACRM_HOSTNAME}/v2api/auth/login" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${ALFACRM_EMAIL}\",\"api_key\":\"${ALFACRM_API_KEY}\"}"
