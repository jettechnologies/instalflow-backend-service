# =========================================================
# Base Image
# =========================================================
FROM node:20-alpine AS base

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# =========================================================
# Install dependencies (ONLY dependencies)
# =========================================================
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

# IMPORTANT: no prisma generate here
RUN pnpm install

# =========================================================
# Copy full source
# =========================================================
COPY . .

# =========================================================
# Build ONLY (safe, no env dependency)
# =========================================================
RUN pnpm run build


# =========================================================
# Production Image
# =========================================================
FROM node:20-alpine AS production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV=production

# Install only production deps (clean runtime)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod

# Copy only runtime artifacts
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/prisma.config.ts ./prisma.config.ts
COPY --from=base /app/mail-templates ./mail-templates
COPY --from=base /app/docker ./docker

RUN chmod +x docker/*.sh

RUN ls -R dist

EXPOSE 10000

CMD ["echo", "Use docker-compose to start services"]