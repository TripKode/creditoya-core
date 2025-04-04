FROM node:20-alpine

WORKDIR /app

# Instalamos dependencias necesarias para Prisma y compilación
RUN apk add --no-cache python3 make g++

# Copiamos solo lo necesario para instalar dependencias
COPY package*.json ./
COPY prisma ./prisma/

# Instalamos todas las dependencias, incluyendo las de desarrollo necesarias para build
RUN npm ci

# Generamos cliente Prisma
RUN npx prisma generate

# Copiamos el resto de la aplicación
COPY . .

# Compilamos la aplicación
RUN npm run build

# Verificamos que el archivo main.js existe en la ubicación especificada
RUN if [ -f "dist/src/main.js" ]; then \
      echo "Archivo main.js encontrado en dist/src/main.js"; \
    else \
      echo "ERROR: No se encontró main.js en dist/src/" && \
      find dist -name "main.js" && \
      exit 1; \
    fi

# Configuración de entorno
ENV NODE_ENV=production \
    PORT=8080

# Exponemos puerto
EXPOSE 8080

# Script de inicio simple con ruta específica
RUN echo '#!/bin/sh\n\
echo "Ejecutando migraciones de Prisma..."\n\
npx prisma migrate deploy --schema=./prisma/schema.prisma || true\n\
echo "Iniciando aplicación..."\n\
exec node dist/src/main.js\n' > /app/start.sh && chmod +x /app/start.sh

# Iniciamos la aplicación con el script
CMD ["/app/start.sh"]