# ---------- build: mediasoup builds its C++ worker; needs a toolchain on Alpine (musl) ----------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 py3-pip make g++ linux-headers
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- runtime: compiled code + production dependencies only ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# the mediasoup worker links against the C++ runtime
RUN apk add --no-cache libstdc++
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
USER node
# 4021 HTTP API, 4022 Socket.IO, 10000-20000/udp mediasoup (group calls)
EXPOSE 4021 4022 10000-20000/udp
CMD ["node", "dist/index.js"]
