FROM node:20

WORKDIR /app

RUN corepack enable

# System libs required by Puppeteer's bundled Chromium on Debian Bookworm
# (the node:20 base image is slim and ships none of these). Without them
# `puppeteer.launch()` crashes silently in production and every PDF export
# returns a generic 500. We do NOT install Debian's chromium package — we
# rely on the Chromium binary that puppeteer downloads during `pnpm install`
# (postinstall hook). That binary works fine once these runtime libs are
# present.
#
# Also installing:
#   - openssl                  → required by Prisma's binary engine
#   - fonts-liberation         → safe Latin fallback so PDFs aren't empty
#   - fonts-noto-color-emoji   → for emoji that appear in some templates
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libc6 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libexpat1 \
      libfontconfig1 \
      libgbm1 \
      libgcc-s1 \
      libglib2.0-0 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libx11-xcb1 \
      libxcb1 \
      libxcomposite1 \
      libxcursor1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxi6 \
      libxrandr2 \
      libxrender1 \
      libxss1 \
      libxtst6 \
      lsb-release \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY . .

# Build the shared workspace package BEFORE the backend — backend imports
# `@inventorymdb/shared` whose `main`/`types` point to ./dist, which only
# exists after tsc has run on the package.
RUN pnpm --filter @inventorymdb/shared build
RUN pnpm --filter @inventorymdb/backend prisma:generate
RUN pnpm --filter @inventorymdb/backend build

EXPOSE 3001

CMD ["pnpm", "--filter", "@inventorymdb/backend", "start:prod"]
