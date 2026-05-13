# Sealara

Интеллектуальная система поддержки медицинской диагностики с архитектурой:
- frontend (React + webpack dev server),
- API gateway (`server/index.cjs`, Node.js + MySQL + Redis),
- ML service (`ml-service/app.py`, FastAPI).

## Архитектура

```text
Browser (React)
    → Node API (`server/index.cjs`: auth, диагностика, врач, прокси к ML)
        → MySQL (пользователи, сессии, doctor_feedback, recent_queries)
        → Redis (очередь отложенного фидбека, кэш ответов ML при необходимости)
    → ML service (`ml-service/app.py`: `/train`, `/predict`, `/feedback`, версии моделей)
        → Redis (снимок состояния `REDIS_STATE_KEY`, активная версия, блокировка обучения, Pub/Sub смены версии)
        → Диск `MODELS_DIR` (joblib-артефакты, `manifest.json`, версии `vN/` с `meta.json` и SHA-256 файлов)
```

Поток диагностики: клиент шлёт симптомы на API → API вызывает ML (`/preprocess`, `/predict`, при низкой уверенности `/fallback/cosine`) → при подтверждении врачом API формирует payload и вызывает ML `/feedback`. Обучение: ML принимает каталог болезней и накопленные кейсы, считает признаки (`ml_service/features.py`), обучает ансамбль; при смене активной версии узел публикует событие в Redis, остальные реплики ML перечитывают снапшот с диска.

## Быстрый старт (Docker)

1. Подготовь переменные:
   - `cp .env.example .env`
2. Подними сервисы:
   - `docker compose up --build`

После старта:
- API health: [http://localhost:3001/api/health](http://localhost:3001/api/health)
- Prometheus scrape (API process): [http://localhost:3001/metrics](http://localhost:3001/metrics) (врачебные агрегаты по-прежнему на `GET /api/metrics`)
- ML health: [http://localhost:8001/health](http://localhost:8001/health)
- Prometheus scrape (ML): [http://localhost:8001/prometheus](http://localhost:8001/prometheus) (JSON-метрики приложения остаются на `GET /metrics`)
- Prometheus UI: [http://localhost:9090](http://localhost:9090)
- Grafana: [http://localhost:3002](http://localhost:3002) (`admin` / `admin`, дашборд `Sealara Overview` провиженится автоматически)
- Swagger: [http://localhost:3001/api-docs](http://localhost:3001/api-docs)

## Локальный запуск (без Docker)

## 1) Установи зависимости

- Node.js:
  - `npm install`
- Python:
  - `python3 -m venv .venv`
  - `source .venv/bin/activate`
  - `python3 -m pip install -r ml-service/requirements.txt`

## 2) Подними инфраструктуру

Нужны запущенные:
- MySQL (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)
- Redis (`REDIS_URL`)

## 3) Скопируй env

- `cp .env.example .env`

Секреты обязательно поменять перед production:
- `JWT_SECRET`
- `ML_API_KEY`

Сессии:
- access token живёт ограниченно (`ACCESS_TOKEN_TTL`, по умолчанию `15m`);
- refresh token хранится в `httpOnly` cookie и ротируется через `POST /api/auth/refresh`.
- для refresh включён rate limit (`REFRESH_RATE_LIMIT_WINDOW_MS`, `REFRESH_RATE_LIMIT_MAX`)
  и строгая fingerprint-проверка (hash `user-agent` с серверным pepper); строки без `fingerprint_hash` (старые токены) принимаются до следующей ротации.
- несовпадение fingerprint: `401`, событие `refresh_failed_fingerprint_mismatch`, счётчик `api_auth_refresh_fingerprint_mismatch_total`, предупреждение в логах.
- добавлен аудит auth-событий в БД (`auth_events`) и endpoint для врача:
  `GET /api/doctor/auth-events`.

## 4) Запуск сервисов

В отдельных терминалах:
- ML service:
  - `npm run ml:serve`
- API:
  - `npm run server`
- Frontend:
  - `npm run dev`

## 5) Проверка

- API: `GET /api/health`
- ML: `GET /health`
- Метрики API (для doctor): `GET /api/metrics`
- Метрики ML (через API proxy, для doctor): `GET /api/ml/metrics`

## Полезные команды

- Node tests: `npm run test:node`
- ML tests: `npm run test:ml`
- Build frontend: `npm run build`

## Команды через Makefile

- Запуск сервисов: `make up`
- Остановка: `make down`
- Перезапуск: `make restart`
- Логи: `make logs`
- Статус контейнеров: `make ps`
- Быстрая проверка health: `make health`
- Локальный запуск (ML + API + frontend): `make dev`
- Тесты (Node + ML): `make test`

`make dev` запускает 3 процесса через `concurrently`:
- `npm run ml:serve`
- `npm run server`
- `npm run dev`

## Переменные окружения

Смотри полный шаблон в `.env.example`. Ключевые группы:

| Область | Примеры |
|--------|---------|
| API | `PORT`, `JWT_SECRET`, `ML_SERVICE_URL`, `ML_API_KEY`, `DB_*`, `REDIS_URL` |
| ML | `ML_API_KEY`, `REDIS_URL`, `REDIS_STATE_KEY`, `MODELS_DIR`, `CONFIRMED_BATCH_SIZE`, `MAX_VOCAB_SIZE`, `MI_MIN_THRESHOLD` |
| Согласованность реплик ML | `REDIS_MODEL_PUBSUB_CHANNEL` (Pub/Sub: смена версии модели) |
| Лимиты на ML | `ML_RATE_LIMIT_WINDOW_SEC`, `ML_RATE_LIMIT_MAX` (защита прямых вызовов FastAPI) |
| CSP/COEP | `CSP_REPORT_ONLY`, `COEP_POLICY`, `CSP_CONNECT_SRC_EXTRA`, `CSP_SCRIPT_SRC_EXTRA`, `CSP_REPORT_URI` |

`MI_MIN_THRESHOLD` управляет отбором симптомов по взаимной информации (Mutual Information) при обрезке словаря: чем выше порог, тем агрессивнее фильтрация слабых признаков.

## Архитектурные решения (для отчёта/презентации)

- **Разделение ответственности**: UI (`src/`), API gateway (`server/index.cjs`) и ML inference/training (`ml-service/app.py`) разделены по процессам и интерфейсам.
- **Надёжность обучения**: подтверждения врача сначала сохраняются как состояние (`/feedback` пишет на диск + Redis), затем асинхронно инициируется retrain.
- **Согласованность реплик ML**: переключение версии модели публикуется через Redis Pub/Sub; реплики перечитывают версию с диска и обновляют in-memory cache.
- **Контроль целостности артефактов**: для каждого `vN` считаются SHA-256 хэши, при загрузке происходит валидация перед `joblib.load`.
- **Наблюдаемость**: есть Prometheus-метрики для API и ML, плюс готовая Grafana-панель для скриншотов и демонстрации в дипломе.

## Тестирование

- **Node / API**: `npm run test:node` — unit и интеграционные тесты Jest (`server/*.test.cjs`, `tests/integration/*.test.cjs`). E2E-цепочка «регистрация → predict → подтверждение врача → вызов ML `/feedback`»: `tests/integration/e2e-diploma-flow.test.cjs` (нужен `SEALARA_DB_INTEGRATION=1` и MySQL).
- **ML (pytest)**: `npm run test:ml` — признаки, softmax, information gain, интеграция `/train`/`/predict`, мокнутый `_predict_internal`, параллельные `/predict`, проверка SHA-256 артефактов версий.

## Troubleshooting

- Порт занят (`EADDRINUSE`):
  - `lsof -i :3001`
  - `kill -9 <PID>`
  - Аналогично для `8001`, `6379`, `3306`

- `docker: command not found`:
  - Установи Docker Desktop и перезапусти терминал.
  - Проверь: `docker --version`

- API не видит ML (`ML service unavailable`):
  - Проверь `ML_SERVICE_URL` в `.env`
  - Проверь health ML: `curl http://localhost:8001/health`
  - Убедись, что `ML_API_KEY` совпадает в API и ML

- Redis недоступен:
  - Проверь: `redis-cli -h 127.0.0.1 -p 6379 ping`
  - В Docker: `docker compose ps` и `docker compose logs redis`

- MySQL недоступен:
  - Проверь: `mysqladmin ping -h 127.0.0.1 -uroot -proot --silent`
  - В Docker: `docker compose logs db`

- Python `externally-managed-environment` при `pip install`:
  - Используй venv:
    - `python3 -m venv .venv`
    - `source .venv/bin/activate`
    - `python3 -m pip install -r ml-service/requirements.txt`

- Не проходит старт из-за секретов в production:
  - Установи реальные значения:
    - `JWT_SECRET`
    - `ML_API_KEY`
  - Не оставляй значения по умолчанию в production.

- Проверка всей цепочки после фикса:
  - `curl http://localhost:8001/health`
  - `curl http://localhost:3001/api/health`
