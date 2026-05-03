# n8n-nodes-alfacrm

Custom n8n community node for AlfaCRM REST API v2.

Заменяет HTTP Request узлы на типизированный AlfaCRM-узел с:

- **Token caching** — токен 3600s держится в памяти процесса, не дёргаем `/v2api/auth/login` на каждый вызов
- **Auto re-login on 401** — если токен инвалидировался — прозрачный refresh + retry
- **Exponential backoff on 5xx** — 1s → 2s → 4s
- **Local rate limiter** — 5 req/sec (соответствует лимиту AlfaCRM API)
- **Resources:** customer, lesson, branch, lead-source
- **Operations:** list, get, create, update, delete

## Установка в n8n

```bash
# Self-hosted n8n
cd ~/.n8n/nodes
npm install n8n-nodes-alfacrm
docker compose restart n8n
```

В UI: Settings → Community Nodes → ставим галку «Allow community nodes», вводим `n8n-nodes-alfacrm`.

## Использование

1. Credentials → New → AlfaCRM API → заполнить hostname/email/apiKey/branchId
2. В workflow перетащить узел `AlfaCRM`
3. Resource: Customer, Operation: Create, Body:
   ```json
   {
     "name": "Иван Петров",
     "phone": ["+79161234567"],
     "lead_status_id": 1,
     "is_study": 0,
     "branch_ids": [1]
   }
   ```

Узел сам обработает auth, ретраи и rate limit.

## Разработка

```bash
npm install
npm run dev   # tsc --watch
```

После сборки `dist/` подкладывается в n8n custom nodes path.
