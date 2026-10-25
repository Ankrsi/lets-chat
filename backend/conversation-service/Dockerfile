# ---------- build: mediasoup needs a C++ toolchain to build its worker ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip make g++ \
 && ln -sf /usr/bin/python3 /usr/bin/python \
 && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- runtime: compiled code + production dependencies only ----------
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
USER node
# 4021 HTTP API, 4022 Socket.IO, 10000-20000/udp mediasoup (group calls)
EXPOSE 4021 4022 10000-20000/udp
CMD ["node", "dist/index.js"]
