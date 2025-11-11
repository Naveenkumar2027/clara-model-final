FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files for monorepo
COPY package*.json ./
COPY apps/*/package*.json ./apps/*/
COPY packages/*/package*.json ./packages/*/

# Install all dependencies
RUN npm ci

# Copy all source files
COPY apps ./apps
COPY packages ./packages

# Build all shared packages (needed by server and apps)
WORKDIR /app/packages/shared
RUN npm run build

WORKDIR /app/packages/shared-schedule
RUN npm run build

WORKDIR /app/packages/webrtc
RUN npm run build

# Build client app
WORKDIR /app/apps/client
RUN npm run build

# Build staff app
WORKDIR /app/apps/staff
RUN npm run build

# Build server app
WORKDIR /app/apps/server
RUN npm run build

# Production image
FROM node:18-alpine

WORKDIR /app

# Maintain the monorepo structure that the server code expects
# Server code uses path.resolve(__dirname, '../../client/dist')
# So if server is at /app/apps/server/dist/index.js, then:
# ../../client/dist resolves to /app/apps/client/dist

# Copy server built files maintaining structure
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package*.json ./apps/server/

# Copy client and staff built files
COPY --from=builder /app/apps/client/dist ./apps/client/dist
COPY --from=builder /app/apps/staff/dist ./apps/staff/dist

# Copy built shared packages (needed at runtime)
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/

COPY --from=builder /app/packages/shared-schedule/dist ./packages/shared-schedule/dist
COPY --from=builder /app/packages/shared-schedule/package.json ./packages/shared-schedule/
COPY --from=builder /app/packages/shared-schedule/data ./packages/shared-schedule/data

COPY --from=builder /app/packages/webrtc/dist ./packages/webrtc/dist
COPY --from=builder /app/packages/webrtc/package.json ./packages/webrtc/

# Copy node_modules (server dependencies and workspace packages)
COPY --from=builder /app/node_modules ./node_modules

# Copy package.json for workspace resolution
COPY --from=builder /app/package.json ./

EXPOSE 8080

ENV NODE_ENV=production
ENV ENABLE_UNIFIED_MODE=true

WORKDIR /app/apps/server

CMD ["node", "dist/index.js"]

