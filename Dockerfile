# syntax=docker/dockerfile:1.7

FROM node:22.12.0-bookworm-slim AS base

ENV CI=true
RUN apt-get update \
  && apt-get install --yes --no-install-recommends curl openssl \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.30.3

WORKDIR /app

# Keep dependency installation reusable when only application source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/sakinzihin-web/package.json apps/sakinzihin-web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
COPY packages/testing/package.json packages/testing/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm config set store-dir /pnpm/store
RUN --mount=type=cache,id=meditation-pnpm-store,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile

COPY . .
RUN pnpm db:generate

FROM base AS api-build
RUN pnpm --filter @meditation/core build \
  && pnpm --filter @meditation/database build \
  && pnpm --filter @meditation/api build
RUN --mount=type=cache,id=meditation-pnpm-store,target=/pnpm/store,sharing=locked \
  pnpm --filter @meditation/api deploy --prod --legacy --prefer-offline /out/api \
  && cd /out/api/node_modules/@meditation/database \
  && ./node_modules/.bin/prisma generate

FROM node:22.12.0-bookworm-slim AS api
ENV CI=true
RUN apt-get update \
  && apt-get install --yes --no-install-recommends curl openssl wget \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/api
COPY --from=api-build /out/api ./
COPY --from=api-build /app/packages/prompts /app/packages/prompts
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "cd node_modules/@meditation/database && ./node_modules/.bin/prisma migrate deploy && cd /app/apps/api && node dist/commands/sync-prompts.js && node dist/main.js"]

FROM base AS admin-build
ARG NEXT_PUBLIC_API_URL=https://meditation-api.pusulamkendim.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,id=meditation-next-cache,target=/app/apps/admin/.next/cache,sharing=locked \
  pnpm --filter @meditation/ui build \
  && pnpm --filter @meditation/admin build

FROM node:22.12.0-bookworm-slim AS admin
ARG NEXT_PUBLIC_API_URL=https://meditation-api.pusulamkendim.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install --yes --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=admin-build --chown=node:node /app/apps/admin/.next/standalone ./
COPY --from=admin-build --chown=node:node /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=admin-build --chown=node:node /app/apps/admin/public ./apps/admin/public
EXPOSE 3001
USER node
CMD ["node", "apps/admin/server.js"]

FROM base AS sakinzihin-web-build
ARG NEXT_PUBLIC_API_URL=https://meditation-api.pusulamkendim.com
ARG NEXT_PUBLIC_SITE_URL=https://sakinzihin.com
ARG NEXT_PUBLIC_LEGACY_APP_ORIGIN=https://portal.pusulamkendim.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_LEGACY_APP_ORIGIN=$NEXT_PUBLIC_LEGACY_APP_ORIGIN
ENV NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER=905428078429
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,id=meditation-next-cache-public,target=/app/apps/sakinzihin-web/.next/cache,sharing=locked \
  pnpm --filter @meditation/sakinzihin-web build

FROM node:22.12.0-bookworm-slim AS sakinzihin-web
ARG NEXT_PUBLIC_API_URL=https://meditation-api.pusulamkendim.com
ARG NEXT_PUBLIC_SITE_URL=https://sakinzihin.com
ARG NEXT_PUBLIC_LEGACY_APP_ORIGIN=https://portal.pusulamkendim.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_LEGACY_APP_ORIGIN=$NEXT_PUBLIC_LEGACY_APP_ORIGIN
ENV NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER=905428078429
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3002
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install --yes --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=sakinzihin-web-build --chown=node:node /app/apps/sakinzihin-web/.next/standalone ./
COPY --from=sakinzihin-web-build --chown=node:node /app/apps/sakinzihin-web/.next/static ./apps/sakinzihin-web/.next/static
COPY --from=sakinzihin-web-build --chown=node:node /app/apps/sakinzihin-web/public ./apps/sakinzihin-web/public
EXPOSE 3002
USER node
CMD ["node", "apps/sakinzihin-web/server.js"]

FROM base AS worker-build
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
RUN pnpm --filter @meditation/core build \
  && pnpm --filter @meditation/database build \
  && pnpm --filter @meditation/worker build
RUN --mount=type=cache,id=meditation-pnpm-store,target=/pnpm/store,sharing=locked \
  pnpm --filter @meditation/worker deploy --prod --legacy --prefer-offline /out/worker \
  && cd /out/worker/node_modules/@meditation/database \
  && ./node_modules/.bin/prisma generate

FROM node:22.12.0-bookworm-slim AS worker
ENV CI=true
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ffmpeg openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=worker-build --chown=node:node /out/worker ./
ENV NODE_ENV=production
USER node
CMD ["node", "dist/main.js"]
