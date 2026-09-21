FROM node:22-slim AS build
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY packages/server packages/server
RUN pnpm -C packages/shared build && pnpm -C packages/server build

FROM node:22-slim
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app .
EXPOSE 8080
CMD ["node", "packages/server/dist/server.js"]
