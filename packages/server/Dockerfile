# Build context is the repo root (see fly.toml). One image: the game server plus the built web app it serves.
FROM node:22-slim
RUN corepack enable && apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Dependencies first so this layer caches until a package.json or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

COPY packages packages
RUN pnpm --filter @fcdn/web build

# @fcdn/shared is TypeScript source with extension-less imports, so plain `node dist/server.js` cannot load
# it. Run the server through tsx (as scripts/play-online.sh does); it also serves packages/web/dist.
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
WORKDIR /app/packages/server
CMD ["node", "--import", "tsx", "src/server.ts"]
