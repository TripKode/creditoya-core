# Multi-stage build para optimizar tamaño final
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy dependency files
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Copy .env file explicitly
COPY .env .env

# Build the application
RUN npm run build

# Verify build output
RUN if [ -f "dist/src/main.js" ]; then \
      echo "✅ Build exitoso: main.js encontrado"; \
    else \
      echo "❌ ERROR: Build falló - main.js no encontrado" && \
      find dist -name "*.js" | head -10 && \
      exit 1; \
    fi

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install only runtime dependencies (Prisma needs openssl)
RUN apk add --no-cache openssl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/.env ./.env

# Change ownership to non-root user
RUN chown -R nestjs:nodejs /app
USER nestjs

# Environment configuration
ENV NODE_ENV=production \
    PORT=8080 \
    NPM_CONFIG_CACHE=/tmp/.npm

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Startup script optimizado
RUN echo '#!/bin/sh' > start.sh && \
    echo 'set -e' >> start.sh && \
    echo 'echo "🚀 Iniciando aplicación..."' >> start.sh && \
    echo 'echo "📊 Ejecutando migraciones de Prisma..."' >> start.sh && \
    echo 'npx prisma migrate deploy --schema=./prisma/schema.prisma 2>/dev/null || echo "⚠️ Migraciones omitidas"' >> start.sh && \
    echo 'echo "🎯 Iniciando servidor NestJS..."' >> start.sh && \
    echo 'exec node dist/src/main.js' >> start.sh && \
    chmod +x start.sh

# Use exec form for better signal handling
CMD ["./start.sh"]