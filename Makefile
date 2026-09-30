# Локальная разработка. Переменные берутся из backend/.env.
SHELL := /bin/bash
ENV_FILE := backend/.env

.PHONY: dev-backend dev-frontend gen gen-db gen-api test build

dev-backend: ## Запустить API + бот + воркеры
	cd backend && set -a && source .env && set +a && go run ./cmd/pitly

dev-frontend: ## Запустить mini app (Vite)
	cd frontend && pnpm dev

gen: gen-db gen-api ## Сгенерировать весь код из SQL и OpenAPI

gen-db:
	cd backend && sqlc generate

gen-api:
	cd backend && go tool oapi-codegen -config oapi-codegen.yaml ../api/openapi.yaml
	cd frontend && pnpm gen:api

test:
	cd backend && go vet ./... && go test ./...

build:
	cd frontend && pnpm build
	cd backend && CGO_ENABLED=0 go build -o bin/pitly ./cmd/pitly
