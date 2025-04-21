FROM node:20-alpine3.18@sha256:securehashvalue

WORKDIR /app

# Install dependencies for Prisma and compilation
RUN apk add --no-cache python3 make g++

# Copy only what's needed for dependencies
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Verify main.js exists
RUN if [ -f "dist/src/main.js" ]; then \
      echo "Archivo main.js encontrado en dist/src/main.js"; \
    else \
      echo "ERROR: No se encontró main.js en dist/src/" && \
      find dist -name "main.js" && \
      exit 1; \
    fi

# Environment configuration
ENV NODE_ENV=production \
    PORT=8080

# Expose port
EXPOSE 8080

# Create a startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'npx prisma migrate deploy --schema=./prisma/schema.prisma || echo "Migraciones omitidas"' >> /app/start.sh && \
    echo 'node dist/src/main.js' >> /app/start.sh && \
    chmod +x /app/start.sh

# Use the startup script
CMD ["/app/start.sh"]