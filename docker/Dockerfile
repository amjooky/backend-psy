# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Builder — installs deps and compiles TypeScript
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --legacy-peer-deps

COPY . .

RUN npx prisma generate
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production — minimal runtime image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache openssl curl

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/main"]

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Development — hot reload with ts-node
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS development

RUN apk add --no-cache python3 make g++ openssl curl

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY prisma ./prisma/
RUN npx prisma generate

EXPOSE 3000 9229

CMD ["npm", "run", "start:dev"]
