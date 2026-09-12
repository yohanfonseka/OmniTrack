# --- Build stage: install all deps (incl. dev) and produce dist/ ---
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# --- Runtime stage: production-only deps + built output ---
FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/dist ./dist
COPY firebase-applet-config.json ./firebase-applet-config.json

# Cloud Run injects $PORT and expects the container to listen on it.
EXPOSE 8080

CMD ["bun", "dist/server.cjs"]
