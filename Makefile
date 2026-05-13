.PHONY: up down restart logs ps health build dev test

up:
	docker compose up --build -d

down:
	docker compose down

restart:
	docker compose down
	docker compose up --build -d

logs:
	docker compose logs -f --tail=200

ps:
	docker compose ps

health:
	@echo "Checking ML health..."
	@curl -fsS http://localhost:8001/health >/dev/null && echo "ML: OK" || echo "ML: FAIL"
	@echo "Checking API health..."
	@curl -fsS http://localhost:3001/api/health >/dev/null && echo "API: OK" || echo "API: FAIL"

build:
	docker compose build

dev:
	npm run dev:full

test:
	npm run test:node && npm run test:ml
