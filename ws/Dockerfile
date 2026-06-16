# ── Stage 1: Build ──
FROM node:18-alpine AS builder
WORKDIR /build

# Copy shared package first (dependency)
COPY shared/package.json shared/tsconfig.json ./shared/
COPY shared/src ./shared/src
RUN cd shared && npm install && npm run build

# Copy WS package
COPY ws/package.json ws/package-lock.json ./ws/
RUN cd ws && npm install

COPY ws/tsconfig.json ./ws/
COPY ws/src ./ws/src
RUN cd ws && npm run build

# ── Stage 2: Runtime ──
FROM node:18-alpine
WORKDIR /app

COPY --from=builder /build/shared/dist ./shared/dist
COPY --from=builder /build/shared/package.json ./shared/
COPY --from=builder /build/ws/dist ./dist
COPY --from=builder /build/ws/node_modules ./node_modules
COPY --from=builder /build/ws/package.json ./

EXPOSE 3001

CMD ["node", "dist/index.js"]
