FROM node:22.12.0-bookworm-slim AS build

RUN npm install --global pnpm@10.30.3

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate

ARG NEXT_PUBLIC_API_URL=https://meditation-api.pusulamkendim.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm build

FROM build AS api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @meditation/database exec prisma migrate deploy && pnpm --filter @meditation/api sync-prompts && pnpm --filter @meditation/api start"]

FROM build AS admin
ENV NODE_ENV=production
EXPOSE 3001
CMD ["pnpm", "--filter", "@meditation/admin", "start"]

FROM build AS worker
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@meditation/worker", "start"]
