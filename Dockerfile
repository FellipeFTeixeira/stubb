# syntax=docker/dockerfile:1
FROM node:24.22.1-trixie-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /usr/src/app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY libs/contracts/package.json libs/contracts/
COPY apps/write-service/package.json apps/write-service/
COPY apps/read-service/package.json apps/read-service/
COPY apps/projector/package.json apps/projector/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --offline --store-dir /pnpm/store

FROM deps AS dev
# O Nest CLI mata o processo anterior no --watch com tree-kill, que precisa do ps (procps).
RUN apt-get update && apt-get install -y --no-install-recommends procps && rm -rf /var/lib/apt/lists/*
COPY . .
RUN pnpm --filter @stubb/contracts build

FROM deps AS build
COPY . .
RUN pnpm --filter @stubb/contracts build && \
    pnpm --filter @stubb/write-service --filter @stubb/read-service --filter @stubb/projector --filter @stubb/web build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @stubb/write-service deploy --prod --store-dir /pnpm/store /prod/write-service && \
    pnpm --filter @stubb/read-service deploy --prod --store-dir /pnpm/store /prod/read-service && \
    pnpm --filter @stubb/projector deploy --prod --store-dir /pnpm/store /prod/projector

FROM base AS write-service
ENV NODE_ENV=production PORT=3001
COPY --from=build --chown=node:node /prod/write-service ./
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]

FROM base AS read-service
ENV NODE_ENV=production PORT=3002
COPY --from=build --chown=node:node /prod/read-service ./
USER node
EXPOSE 3002
CMD ["node", "dist/main.js"]

FROM base AS projector
ENV NODE_ENV=production PORT=3003
COPY --from=build --chown=node:node /prod/projector ./
USER node
EXPOSE 3003
CMD ["node", "dist/main.js"]

FROM nginx:1.30.6-alpine AS gateway
COPY infra/nginx/nginx.prod.conf /etc/nginx/conf.d/default.conf
COPY --from=build /usr/src/app/apps/web/dist /usr/share/nginx/html

FROM nginx:1.30.6-alpine AS gateway-dev
COPY infra/nginx/nginx.dev.conf /etc/nginx/conf.d/default.conf
