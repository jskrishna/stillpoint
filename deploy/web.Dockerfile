# Stillpoint's web app.
#
# The same standalone build the desktop shell runs: Next traces what the server
# actually needs and emits it with its own `node_modules`, so the runtime image
# carries no pnpm, no workspace and no build tooling.
#
# Built from the repository root (`docker build -f deploy/web.Dockerfile .`),
# because the app consumes `packages/*` through the workspace.

# --- build ------------------------------------------------------------------
FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /repo

# The manifests first, so a change to source code does not re-resolve every
# dependency.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Every workspace member's manifest, including the two this image does not
# build: pnpm reads `pnpm-workspace.yaml` and fails on a member whose
# `package.json` is missing, whatever `--filter` says.
COPY packages/protocol/package.json packages/protocol/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/client/package.json packages/client/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY apps/desktop/package.json apps/desktop/

# Only what this image builds. `apps/mobile` and `apps/desktop` are in the
# workspace and are not wanted here; Electron alone would be 280 MB.
RUN pnpm install --frozen-lockfile \
      --filter @stillpoint/web... \
      --filter "./packages/*" \
    && pnpm store prune

COPY tsconfig.base.json tsconfig.json ./
COPY packages packages
COPY apps/web apps/web

# The API's address is read by the browser, so it is fixed at build time. A
# build is therefore per-environment; `deploy/README.md` says so.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# `build:standalone`, not `build`: the standalone output is opt-in — `next start`
# is unsupported alongside it — and it lands in `.next-standalone/`. See
# `apps/web/next.config.ts`.
RUN pnpm run build:packages && pnpm --filter @stillpoint/web run build:standalone

# `public/` holds the self-hosted fonts and so always exists — but a `COPY` of
# a directory that is not there fails the build with a checksum error that says
# nothing about why, which is exactly how this was found. One line here instead
# of a build that breaks the day somebody empties it.
RUN mkdir -p apps/web/public

# --- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

# Next leaves these two out of the standalone output because a deployment
# usually serves them from a CDN. There is no CDN here, and without them every
# stylesheet and chunk 404s — the same trap the desktop shell's bundler hits.
COPY --from=build --chown=node:node /repo/apps/web/.next-standalone/standalone/ ./
COPY --from=build --chown=node:node /repo/apps/web/.next-standalone/static ./apps/web/.next-standalone/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public

USER node

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
