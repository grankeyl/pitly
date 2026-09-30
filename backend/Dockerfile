# Сборка фронта и бэка в один образ: Go-бинарник раздаёт и API, и mini app.
FROM node:22-alpine AS web
WORKDIR /src
RUN corepack enable
COPY api ./api
COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/
RUN cd frontend && pnpm install --frozen-lockfile
COPY frontend ./frontend
RUN cd frontend && pnpm build

FROM golang:1.26-alpine AS server
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /pitly ./cmd/pitly

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata
COPY --from=server /pitly /usr/local/bin/pitly
COPY --from=web /src/frontend/dist /srv/www
# Порт: HTTP_ADDR или PORT хостинга, иначе :8080
ENV STATIC_DIR=/srv/www
EXPOSE 8080
USER nobody
ENTRYPOINT ["pitly"]
