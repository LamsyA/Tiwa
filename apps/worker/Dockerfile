# P0-T05: worker runtime — Node 22 + ffmpeg (sharp video/poster, voice
# notes and Moments processing need it from P5 onwards).
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/worker ./apps/worker
COPY packages ./packages

RUN corepack enable \
  && pnpm install --frozen-lockfile --filter @tiwa/worker... \
  && pnpm --filter @tiwa/worker build \
  && pnpm store prune

ENV NODE_ENV=production

CMD ["node", "apps/worker/dist/index.js"]
