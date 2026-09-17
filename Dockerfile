# Image unique, deux cibles : `web` et `bot`.
#
#   docker build --target web -t jobrick-web .
#   docker build --target bot -t jobrick-bot .
#
# Sur Dokploy, chaque service pointe sur ce Dockerfile avec sa cible, le
# contexte de build etant la racine du depot (le monorepo pnpm a besoin du
# lockfile et des deux paquets partages).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# --- Dependances ------------------------------------------------------------
# Les manifestes sont copies seuls : tant qu'ils ne changent pas, Docker
# reutilise le cache de `pnpm install` meme si le code a bouge.
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc package.json ./
COPY apps/web/package.json   apps/web/
COPY apps/bot/package.json   apps/bot/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json   packages/db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- Build ------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN pnpm --filter @jobrick/web build

# --- Site -------------------------------------------------------------------
FROM base AS web
ENV NODE_ENV=production
ENV PORT=3000
# Le serveur SSR garde des imports vers `node_modules` (effect, react,
# @effect/sql-pg...) : l'arborescence est reprise telle quelle plutot que de
# tenter un elagage qui casserait les liens du workspace.
COPY --from=build /app /app
WORKDIR /app/apps/web
EXPOSE 3000
# Migrations jouees au demarrage : le conteneur est toujours en phase avec le
# schema, et un rollback d'image ne laisse pas de base en avance.
CMD ["sh", "-c", "cd /app/packages/db && node --experimental-strip-types src/migrate.ts && cd /app/apps/web && node serve.js"]

# --- Bot --------------------------------------------------------------------
FROM base AS bot
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/bot
# Le bot n'a pas d'etape de compilation : Node dé-type les `.ts` a la volee.
CMD ["node", "--experimental-strip-types", "src/main.ts"]
