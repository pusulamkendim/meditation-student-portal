FROM node:22.12.0-bookworm-slim AS base

ENV CI=true
RUN apt-get update \
  && apt-get install --yes --no-install-recommends curl openssl \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.30.3

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate

FROM base AS api-build
RUN pnpm --filter @meditation/core build \
  && pnpm --filter @meditation/database build \
  && pnpm --filter @meditation/api build
RUN pnpm --filter @meditation/api deploy --prod --legacy --prefer-offline /out/api \
  && cd /out/api/node_modules/@meditation/database \
  && ./node_modules/.bin/prisma generate

FROM node:22.12.0-bookworm-slim AS api
ENV CI=true
RUN apt-get update \
  && apt-get install --yes --no-install-recommends curl openssl \
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
RUN pnpm --filter @meditation/ui build \
  && pnpm --filter @meditation/admin build

FROM node:22.12.0-bookworm-slim AS admin
ARG NEXT_PUBLIC_API_URL=https://meditation-api.pusulamkendim.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=admin-build --chown=node:node /app/apps/admin/.next/standalone ./
COPY --from=admin-build --chown=node:node /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=admin-build --chown=node:node /app/apps/admin/public ./apps/admin/public
EXPOSE 3001
USER node
CMD ["node", "apps/admin/server.js"]

FROM base AS worker-build
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
RUN pnpm --filter @meditation/core build \
  && pnpm --filter @meditation/database build \
  && pnpm --filter @meditation/worker build
RUN pnpm --filter @meditation/worker deploy --prod --legacy --prefer-offline /out/worker \
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
