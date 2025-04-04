# Usamos una única etapa para simplificar
FROM node:20-alpine

WORKDIR /app

# Mejoramos la configuración de npm para problemas de red
RUN npm config set registry https://registry.npmjs.org/ \
    && npm config set fetch-timeout 600000 \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-maxtimeout 120000

# Instalamos paquetes necesarios para compilaciones nativas
RUN apk add --no-cache python3 make g++

# Copiamos archivos de package para aprovechar la caché
COPY package*.json ./

# Instalamos dependencias con configuración tolerante a fallos de red
RUN npm install --no-fund --network-timeout=600000 --prefer-offline

# Copiamos el resto de los archivos (incluyendo schema.prisma)
COPY . .

# Generamos el cliente Prisma antes de la compilación
RUN npx prisma generate

# Compilamos la aplicación NestJS
RUN npm run build && \
    find dist -name "main.js" && \
    ls -la dist/ && \
    echo "Verificando archivo principal..." && \
    if [ -f "./dist/src/main.js" ]; then echo "Archivo principal existe"; else echo "Archivo principal NO encontrado" && exit 1; fi

# Variables de entorno
ENV NODE_ENV=production \
    PORT=8080

# Exponemos los puertos necesarios
EXPOSE 8080

# Script para iniciar la aplicación correctamente
RUN echo "#!/bin/sh\n\
echo 'Configurando Prisma...'\n\
npx prisma generate --schema=./prisma/schema.prisma\n\
\n\
echo 'Iniciando migraciones de Prisma...'\n\
npx prisma migrate deploy --schema=./prisma/schema.prisma || echo 'Migraciones fallidas - continuando de todos modos'\n\
\n\
echo 'Iniciando aplicación...'\n\
exec npm run start:prod\n" > /app/startup.sh && chmod +x /app/startup.sh

# Comando para iniciar la aplicación
CMD ["/app/startup.sh"]