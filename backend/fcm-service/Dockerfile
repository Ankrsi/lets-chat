# ==========================

# Builder Stage

# ==========================

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# ==========================

# Runtime Stage

# ==========================

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/utils ./src/utils

EXPOSE 4025

CMD ["node", "dist/index.js"]
