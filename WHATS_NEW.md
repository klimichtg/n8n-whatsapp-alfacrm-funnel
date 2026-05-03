# Что добавлено в v2 (enterprise edition)

Версия 1 была работающим демо: один main funnel + cron follow-up. v2 — это production-ready архитектура с 7 воркфлоу (90 узлов суммарно) и custom n8n-нодой.

## Новые workflow

| ID | Workflow | Зачем |
| --- | --- | --- |
| `01` | Main Funnel **(rewritten)** | Добавлен signature validation, multimodal routing (audio/image), вызовы sub-workflow вместо inline-логики, action routing (continue/move_stage/handoff) |
| `10` | Sub: AlfaCRM Auth (Redis cached + retry) | Один токен на ~17 280 запросов/час вместо auth-вызова на каждое сообщение |
| `12` | Sub: Message Buffer (Redis debounce) | Бот ждёт 6 секунд после последнего сообщения и отвечает на склеенный контекст — выглядит как живой человек |
| `20` | Error Handler → Telegram | Любая ошибка любого workflow → формат + execution URL → алерт менеджеру |
| `21` | Sub: Hot Lead Handoff → Telegram | Когда AI помечает лида как горячий — карточка с deep-link и историей диалога летит в канал отдела продаж с inline-кнопкой «Взять в работу» |
| `30` | Health Check (cron 5 мин) | Параллельный пинг n8n + Evolution + AlfaCRM. Деградация → Telegram алерт за 5 минут |

## Новая инфраструктура

- **`Caddyfile`** — production reverse proxy с автоматическим Let's Encrypt HTTPS, rate-limit на webhook (60/min/IP), отдельные домены для n8n и Evolution
- **`packages/n8n-nodes-alfacrm/`** — custom n8n community node (TypeScript). Заменяет HTTP Request узлы на типизированный AlfaCRM-узел с in-memory token cache, auto re-login на 401, exponential backoff на 5xx, и in-process token bucket 5 req/sec. **Это уровень контрибьютора в n8n marketplace**, который мало кто из фрилансеров реально пишет.
- **`.github/workflows/validate.yml`** — CI: JSON-валидация всех workflow, shellcheck для bash-скриптов, TypeScript noEmit для custom node
- **`examples/test_scenarios.sh`** — 5 готовых end-to-end сценариев: новый лид, повторное обращение, горячий лид (handoff), не целевой лид, групповой чат (фильтр)

## README

- **Mermaid-диаграммы**: архитектурный flowchart всех 7 воркфлоу + sequence diagram входящего сообщения
- **Production-чеклист в табличном виде** с ссылками на конкретные файлы реализации
- **Расширенный FAQ**: 10 вопросов вместо 6 (добавлены multimodal, hot-lead, как масштабироваться, что если AlfaCRM лежит)
- **Полная структура репо** с описанием каждого файла

## Production-проблемы, которые решены

1. **«Бот отвечает на каждое сообщение по отдельности — выглядит как робот»** → Redis-debounce 6s + склейка контекста
2. **«AlfaCRM rate limit 5 req/sec выгорает на бурсте»** → Token cache в Redis (TTL 3500s) + token bucket в custom node
3. **«Workflow упал и никто не знает»** → Error Trigger workflow → Telegram алерт с execution URL
4. **«Горячий лид остыл пока менеджер откроет CRM»** → Telegram-канал отдела продаж получает карточку с историей за секунды
5. **«Один из сервисов лёг и весь день никто не замечал»** → Health check cron 5 мин с параллельным пингом всех 3 сервисов
6. **«Webhook принимает что попало от кого попало»** → Signature validation (apikey + опц. HMAC-SHA256) + Caddy rate-limit
7. **«Клиент прислал голосовое — бот не отвечает»** → Whisper STT для audio + GPT-4o vision для изображений
8. **«HTTP Request на AlfaCRM — копипаста между узлами»** → Custom community node с типизированной credential формой и встроенными retry/cache/rate-limit

## Как этим воспользоваться

```bash
git clone <repo>
cd n8n-whatsapp-alfacrm-funnel
cp .env.example .env && nano .env   # заполнить секреты
docker compose up -d

# импортируем все 7 workflow
for f in workflows/*.json; do
  docker compose exec -T n8n-main n8n import:workflow --input="/workflows/$(basename $f)"
done

# 5 тестовых сценариев
WEBHOOK_URL=http://localhost:5678/webhook/evolution-incoming \
  ./examples/test_scenarios.sh
```
