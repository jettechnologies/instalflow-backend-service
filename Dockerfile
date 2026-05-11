# =========================================================
# Base Image
# =========================================================
FROM node:20-alpine AS base

WORKDIR /app

# Enable pnpm
RUN corepack enable

# =========================================================
# Dependencies Layer
# =========================================================
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# =========================================================
# Copy Source
# =========================================================
COPY . .

# =========================================================
# Prisma Generate
# =========================================================
RUN pnpm run db:generate

# =========================================================
# Build Application
# =========================================================
RUN pnpm run build

# =========================================================
# Production Runtime
# =========================================================
FROM node:20-alpine AS production

WORKDIR /app

RUN corepack enable

ENV NODE_ENV=production

# Copy only required files
COPY --from=base /app/package.json ./
COPY --from=base /app/pnpm-lock.yaml ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/mail-templates ./mail-templates

# Expose API port
EXPOSE 10000

# Default command
# CMD ["node", "dist/index.js"]
COPY docker ./docker

RUN chmod +x docker/*.sh