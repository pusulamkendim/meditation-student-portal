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

FROM base AS api
RUN pnpm --filter @meditation/core build \
  && pnpm --filter @meditation/database build \
  && pnpm --filter @meditation/api build
RUN pnpm install --prod --offline --frozen-lockfile
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @meditation/database exec prisma migrate deploy && pnpm --filter @meditation/api sync-prompts && pnpm --filter @meditation/api start"]

FROM base AS admin
ARG NEXT_PUBLIC_API_URL=https://meditation-api.pusulamkendim.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @meditation/ui build \
  && pnpm --filter @meditation/admin build
RUN pnpm install --prod --offline --frozen-lockfile
ENV NODE_ENV=production
EXPOSE 3001
CMD ["pnpm", "--filter", "@meditation/admin", "start"]

FROM base AS worker
RUN pnpm --filter @meditation/core build \
  && pnpm --filter @meditation/database build \
  && pnpm --filter @meditation/worker build
RUN pnpm install --prod --offline --frozen-lockfile
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@meditation/worker", "start"]
