# API WeeklyHome (NestJS + Prisma). Monorepo npm workspaces.
# IMPORTANTE: il contesto di build deve essere la ROOT del repo (non apps/api),
# perché serve il lockfile e il package @weeklyhome/domain.
#   Railway: "Dockerfile Path" = apps/api/Dockerfile, root = repo
#   Render:  Environment = Docker, Dockerfile Path = apps/api/Dockerfile, Context = .

# ---- build ----
FROM node:20-slim AS build
WORKDIR /app
# Prisma ha bisogno di OpenSSL
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Manifests prima (cache dei layer di install)
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# Sorgenti necessari all'API (il web non serve in questa immagine)
COPY packages/domain packages/domain
COPY apps/api apps/api

# Build: prima il dominio, poi l'API (il build dell'API fa `prisma generate && tsc`)
RUN npm run build --workspace @weeklyhome/domain \
 && npm run build --workspace @weeklyhome/api

# ---- runtime ----
FROM node:20-slim AS runtime
WORKDIR /app/apps/api
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
# Copia l'intero workspace (node_modules con client Prisma + symlink @weeklyhome/domain)
COPY --from=build /app /app
EXPOSE 3000
# Applica le migration pendenti, poi avvia. `migrate deploy` è idempotente.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
