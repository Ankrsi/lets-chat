# ---------- build: compile TypeScript, then drop dev dependencies ----------
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- runtime: compiled code + production dependencies only ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
USER node
EXPOSE 4025
CMD ["node", "dist/index.js"]
