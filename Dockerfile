# syntax=docker/dockerfile:1

# ---- Build stage: Vite production bundle ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# VITE_* values are baked into the bundle at build time.
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_APP_NAME="Xây POS"
ARG VITE_ENABLE_QR_API=true
ARG VITE_REALTIME_ENABLED=true
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_APP_NAME=$VITE_APP_NAME \
    VITE_ENABLE_QR_API=$VITE_ENABLE_QR_API \
    VITE_REALTIME_ENABLED=$VITE_REALTIME_ENABLED

RUN npm run build

# ---- Runtime stage: Caddy serves the static files and proxies the API ----
# The Caddyfile is mounted by the backend repo's deploy/docker-compose.yml.
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
