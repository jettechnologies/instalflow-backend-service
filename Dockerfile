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

EXPOSE 10000

CMD ["node", "dist/index.js"]


# # =========================================================
# # Base Image
# # =========================================================
# FROM node:20-alpine AS base

# WORKDIR /app

# RUN corepack enable && corepack prepare pnpm@latest --activate

# # =========================================================
# # Copy dependency files first
# # =========================================================
# COPY package.json pnpm-lock.yaml ./
# COPY prisma ./prisma
# COPY prisma.config.ts ./prisma.config.ts

# RUN pnpm install --frozen-lockfile


# # =========================================================
# # Copy full source AFTER deps installed
# # =========================================================
# COPY . .

# # =========================================================
# # Prisma Generate (NOW schema is available)
# # =========================================================
# RUN pnpm run db:generate

# # =========================================================
# # Build
# # =========================================================
# RUN pnpm run build


# # =========================================================
# # Production Image
# # =========================================================
# FROM node:20-alpine AS production

# WORKDIR /app

# RUN corepack enable && corepack prepare pnpm@latest --activate

# ENV NODE_ENV=production

# # Copy runtime essentials
# COPY package.json pnpm-lock.yaml ./
# COPY --from=base /app/node_modules ./node_modules
# COPY --from=base /app/dist ./dist
# COPY --from=base /app/prisma ./prisma
# COPY --from=base /app/prisma.config.ts ./prisma.config.ts
# COPY --from=base /app/mail-templates ./mail-templates
# COPY --from=base /app/docker ./docker

# RUN chmod +x docker/*.sh

# EXPOSE 10000

# CMD ["node", "dist/index.js"]


# # =========================================================
# # Base Image
# # =========================================================
# FROM node:20-alpine AS base

# WORKDIR /app

# # Enable corepack + pnpm
# RUN corepack enable && corepack prepare pnpm@latest --activate

# # =========================================================
# # Dependencies Layer
# # =========================================================
# COPY package.json pnpm-lock.yaml ./

# RUN pnpm install --frozen-lockfile

# # =========================================================
# # Copy Source
# # =========================================================
# COPY . .

# # =========================================================
# # Prisma Generate
# # =========================================================
# RUN pnpm run db:generate

# # =========================================================
# # Build Application
# # =========================================================
# RUN pnpm run build

# # =========================================================
# # Production Runtime
# # =========================================================
# FROM node:20-alpine AS production

# WORKDIR /app

# RUN corepack enable  && corepack prepare pnpm@latest --activate

# ENV NODE_ENV=production

# # Copy only required files
# COPY --from=base /app/package.json ./
# COPY --from=base /app/pnpm-lock.yaml ./
# COPY --from=base /app/node_modules ./node_modules
# COPY --from=base /app/dist ./dist
# COPY --from=base /app/prisma ./prisma
# COPY --from=base /app/mail-templates ./mail-templates

# # Expose API port
# EXPOSE 10000

# # Default command
# # CMD ["node", "dist/index.js"]
# COPY docker ./docker

# RUN chmod +x docker/*.sh