FROM node:20-alpine AS base

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN apk add --no-cache curl 

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

RUN pnpm install

COPY . .

RUN pnpm run build

# production image
FROM node:20-alpine AS production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN apk add --no-cache curl 

ENV NODE_ENV=production

# Install only production deps (clean runtime)
COPY package.json pnpm-lock.yaml ./

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

CMD ["sh", "docker/start-api.sh"]