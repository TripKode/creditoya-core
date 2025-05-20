# Sistema de Gestión de Préstamos

Un sistema robusto para la gestión integral de préstamos, desarrollado con NestJS y Prisma ORM para MongoDB, que automatiza la validación de documentos, generación de contratos y seguimiento de estados.

## 📋 Características principales

- **Gestión completa de préstamos**: Solicitud, aprobación, rechazo y seguimiento de préstamos.
- **Validación automática de documentos**: Verificación de requisitos documentales para cada solicitud.
- **Generación dinámica de contratos**: Creación automática de PDFs con cláusulas legales personalizadas.
- **Sistema de roles**: Administración basada en permisos para diferentes tipos de usuarios.
- **Seguridad avanzada**: Autenticación JWT, encriptación y auditoría de actividades.
- **Almacenamiento en la nube**: Integración con Google Cloud Storage y Cloudinary.

## 🏗️ Arquitectura

### Tecnologías principales

- **Backend**: NestJS con TypeScript
- **ORM**: Prisma
- **Base de datos**: Cluster de MongoDB
- **Autenticación**: JWT (JSON Web Tokens)
- **Generación de PDFs**: jspdf
- **Almacenamiento**: Google Cloud Storage, Cloudinary
- **Envío de correos**: Resend
- **Contenerización**: Docker
- **Despliegue**: Google Cloud Run

### Estructura de la base de datos

El sistema está construido sobre los siguientes modelos principales:

- **User**: Gestión de usuarios con roles diferenciados.
- **LoanApplication**: Control de solicitudes de préstamos y su estado.
- **Document**: Almacenamiento y gestión de documentos requeridos.
- **GeneratedDocuments**: Contratos y documentos legales generados por el sistema.
- **PasswordReset**: Gestión segura de restablecimiento de contraseñas.

## 🚀 Funcionalidades

### Gestión de Préstamos

- Creación de solicitudes con validación automática de documentos obligatorios
- Flujo de aprobación/rechazo con registro de motivos
- Proceso de ajuste de monto: el sistema permite proponer un nuevo monto al solicitante
- Gestión de aceptación o rechazo de ajustes por parte del cliente
- Sistema de resubida de documentos rechazados
- Notificaciones por correo electrónico mediante Resend
- Generación de contratos en PDF con cláusulas legales

### Gestión Documental

- Carga segura a servicios en la nube
- Validación de formatos y tipos de archivos
- URLs firmadas para acceso seguro a documentos
- Mecanismos de reintento en caso de fallos

### Seguridad y Control de Acceso

- Sistema de autenticación con JWT
- Roles específicos:
  - **admin**: Acceso total al sistema, gestión de empleados y configuraciones
  - **employee**: Gestión de préstamos, documentos, y funciones administrativas incluidas estadísticas y respaldos
  - **client**: Solicitud de préstamos, revisión de contratos y resubida de documentos
- Restablecimiento seguro de contraseñas

### Generación de Documentos

- Plantillas dinámicas para diferentes tipos de documentos:
  - Cartas de instrucción de pago
  - Pagarés
  - Autorizaciones de descuento
- Inserción de texto y firma digital

### Respaldo y Recuperación

- Respaldos automáticos programados para el primer día de cada mes
- Almacenamiento seguro de respaldos
- Mecanismos de restauración y verificación de integridad

## 👥 Casos de uso

### Cliente

1. Registra una solicitud de préstamo
2. Adjunta documentos requeridos
3. Recibe notificación de aprobación, rechazo o ajuste de monto
4. Acepta o rechaza nuevos montos propuestos
5. Resubida de documentos en caso de rechazo
6. Descarga y firma contratos generados

### Empleado

1. Valida documentos de solicitudes
2. Aprueba, rechaza o propone ajustes a préstamos
3. Gestiona rechazos de documentos con retroalimentación
4. Genera documentos legales para clientes
5. Supervisa estadísticas y operaciones
6. Gestiona usuarios del sistema
7. Monitorea y verifica respaldos automáticos

## 🛠️ Instalación y configuración

```bash
# Clonar el repositorio
git clone https://github.com/your-username/sistema-gestion-prestamos.git

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env

# Iniciar contenedores Docker
docker-compose up -d

# Ejecutar migraciones de Prisma
npx prisma migrate dev

# Iniciar la aplicación en modo desarrollo
npm run start:dev
```

## 📚 Documentación

Para una documentación más detallada, consulte los siguientes recursos:

- [Manual de usuario](./docs/user-manual.md)
- [Documentación de la API](./docs/api-docs.md)
- [Guía de despliegue](./docs/deployment-guide.md)

## 🔐 Licencia

Este proyecto está licenciado bajo la Licencia MIT - consulte el archivo [LICENSE](LICENSE) para más detalles.
