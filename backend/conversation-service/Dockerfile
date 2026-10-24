# ==========================
# Builder Stage
# ==========================

FROM node:22-bookworm-slim AS builder

WORKDIR /app

# mediasoup build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# mediasoup expects "python" command
RUN ln -sf /usr/bin/python3 /usr/bin/python

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# ==========================
# Runtime Stage
# ==========================

FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./

# Reuse dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/dist ./dist

COPY --from=builder /app/public ./public

COPY --from=builder /app/i18n ./i18n

COPY --from=builder /app/swagger ./swagger

EXPOSE 4021

EXPOSE 4022

CMD ["node", "dist/index.js"]