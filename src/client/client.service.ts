import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Document, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { RedisService } from 'src/redis/redis.service';
import { CreateClientDto } from './dto/create-client.dto';
import { MailService } from 'src/mail/mail.service';
import { GoogleCloudService } from 'src/gcp/gcp.service';
import * as uuid from "uuid"
import { FileToString } from 'handlers/FileToString';
import { CloudinaryService, FolderNames } from 'src/cloudinary/cloudinary.service';

@Injectable()
export class ClientService {
  private logger = new Logger(ClientService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private mail: MailService,
    private googleCloud: GoogleCloudService,
    private cloudinary: CloudinaryService,
  ) { }

  async create(data: User): Promise<User> {

    const existEmail = await this.prisma.user.findUnique({
      where: { email: data.email.trim() },
    });

    if (existEmail) {
      throw new Error('El correo electrónico ya está en uso');
    }

    if (data.password.length < 6) {
      throw new Error("La contraseña debe tener minimo 6 caracteres");
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const newUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          names: data.names.trim(),
          firstLastName: data.firstLastName.trim(),
          secondLastName: data.secondLastName.trim(),
          currentCompanie: data.currentCompanie,
          email: data.email.trim(),
          password: hashedPassword,
          Document: {
            create: {},
          },
        },
      });

      return user;
    });

    try {
      await this.mail.newClientMail({
        mail: data.email.trim(),
        completeName: `${data.names} ${data.firstLastName} ${data.secondLastName}`
      });
    } catch (emailError) {
      // Log the error but don't throw it to ensure user creation isn't affected
      console.error('Error sending welcome email, but user was created:', emailError);
      // Consider adding email to a resend queue or tracking failed emails
    }

    // Step 5: Invalidate cache
    await Promise.all([
      this.redis.delByPattern('users:*'),
      this.redis.delByPattern('clients:all:*')
    ]);

    return newUser;
  }

  async get(id: string): Promise<User | null> {
    const cacheKey = `user:${id}`;

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        return this.prisma.user.findUnique({
          where: { id },
          include: {
            Document: true, LoanApplication: {
              include: { GeneratedDocuments: true }
            }
          },
        });
      },
      7200 // 2 horas de TTL
    );
  }

  async searchUser(query: string): Promise<User[] | null> {
    const cacheKey = `users:search:${query}`;

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        try {
          // Separar el query en partes usando espacios
          const queryParts = query.trim().split(' ');

          // Construir condiciones de búsqueda dependiendo de cuántas partes tenga el query
          let searchConditions: Prisma.UserWhereInput[] = [];

          if (queryParts.length === 1) {
            // Si solo hay una parte (e.g., solo el primer nombre)
            searchConditions = [
              {
                names: { contains: queryParts[0], mode: 'insensitive' }, // Buscar por nombres
              },
              {
                firstLastName: { contains: queryParts[0], mode: 'insensitive' }, // Buscar por primer apellido
              },
              {
                secondLastName: { contains: queryParts[0], mode: 'insensitive' }, // Buscar por segundo apellido
              },
            ];
          } else if (queryParts.length === 2) {
            // Si hay dos partes (e.g., nombre y apellido)
            searchConditions = [
              {
                // Buscar por primer nombre y primer apellido
                AND: [
                  { names: { contains: queryParts[0], mode: 'insensitive' } }, // Primer nombre
                  {
                    firstLastName: { contains: queryParts[1], mode: 'insensitive' },
                  }, // Primer apellido
                ],
              },
              {
                // Alternativamente, buscar por nombre y segundo apellido
                AND: [
                  { names: { contains: queryParts[0], mode: 'insensitive' } }, // Primer nombre
                  {
                    secondLastName: {
                      contains: queryParts[1],
                      mode: 'insensitive',
                    },
                  }, // Segundo apellido
                ],
              },
            ];
          } else if (queryParts.length >= 3) {
            // Si hay tres o más partes (e.g., dos nombres y un apellido)
            searchConditions = [
              {
                // Buscar por ambos nombres y primer apellido
                AND: [
                  {
                    names: {
                      contains: `${queryParts[0]} ${queryParts[1]}`,
                      mode: 'insensitive',
                    },
                  }, // Ambos nombres
                  {
                    firstLastName: { contains: queryParts[2], mode: 'insensitive' },
                  }, // Primer apellido
                ],
              },
              {
                // Alternativamente, buscar por ambos nombres y segundo apellido
                AND: [
                  {
                    names: {
                      contains: `${queryParts[0]} ${queryParts[1]}`,
                      mode: 'insensitive',
                    },
                  }, // Ambos nombres
                  {
                    secondLastName: {
                      contains: queryParts[2],
                      mode: 'insensitive',
                    },
                  }, // Segundo apellido
                ],
              },
            ];
          }

          // Hacer la búsqueda con Prisma
          const users = await this.prisma.user.findMany({
            where: {
              OR: [
                ...searchConditions,
                {
                  // Filtrar también por número de documento si coincide con el query
                  Document: {
                    some: {
                      number: { contains: query, mode: 'insensitive' },
                    },
                  },
                },
              ],
            },
            include: {
              Document: true, // Incluir los documentos en la respuesta
            },
          });

          return users;
        } catch (error) {
          console.log(error);
          return null;
        }
      },
      300 // 5 minutos de TTL para búsquedas
    );
  }

  async all(
    page: number = 1,
    pageSize: number = 8,
    searchQuery?: string
  ): Promise<{ users: User[]; totalCount: number }> {
    // Incluir el término de búsqueda en la clave de caché si existe
    const searchPart = searchQuery ? `:search:${searchQuery}` : '';
    const cacheKey = `users:page:${page}:size:${pageSize}${searchPart}`;

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        try {
          const skip = (page - 1) * pageSize;

          // Construir condiciones de búsqueda si se proporciona searchQuery
          let where: Prisma.UserWhereInput = {};

          if (searchQuery && searchQuery.trim() !== '') {
            const cleanSearchQuery = searchQuery.trim();

            // Crear condiciones OR para buscar en diferentes campos
            const searchConditions: Prisma.UserWhereInput[] = [
              // Buscar por nombre
              { names: { contains: cleanSearchQuery, mode: 'insensitive' as Prisma.QueryMode } },
              // Buscar por primer apellido
              { firstLastName: { contains: cleanSearchQuery, mode: 'insensitive' as Prisma.QueryMode } },
              // Buscar por segundo apellido
              { secondLastName: { contains: cleanSearchQuery, mode: 'insensitive' as Prisma.QueryMode } },
              // Buscar por documento
              { Document: { some: { number: { contains: cleanSearchQuery } } } }
            ];

            // Asignar condiciones OR al filtro where
            where.OR = searchConditions;

            console.log(`Aplicando búsqueda avanzada para: "${cleanSearchQuery}"`);
          }

          // Añado logging para diagnóstico
          console.log(`Fetching users with skip=${skip}, take=${pageSize}, search=${searchQuery || 'none'}`);

          const [users, totalCount] = await Promise.all([
            this.prisma.user.findMany({
              where,
              skip: skip,
              take: pageSize,
              include: { Document: true }, // Incluye documentos relacionados
              orderBy: { createdAt: 'desc' } // Ordenar por fecha de creación descendente
            }),
            this.prisma.user.count({ where }) // Contar solo los usuarios que coinciden con el filtro
          ]);

          console.log(`Found ${users.length} users out of ${totalCount} total for search: ${searchQuery || 'none'}`);

          return { users, totalCount };
        } catch (error) {
          console.error('Error fetching users:', error);
          // Puedes lanzar una excepción aquí o devolver un valor por defecto
          return { users: [], totalCount: 0 };
        }
      },
      600 // 10 minutos de TTL
    );
  }

  async update(
    id: string,
    data: Omit<User, 'password'>,
  ): Promise<User> {
    const updatedUser = await this.prisma.user.update({ where: { id }, data });

    // Invalidar caché
    await this.redis.del(`user:${id}`);
    await this.redis.delByPattern('users:*');

    return updatedUser;
  }

  async updatePassword(id: string, password: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    // No es necesario invalidar caché ya que el password no se guarda en caché

    return updatedUser;
  }

  async updateAvatar(id: string, avatar: Express.Multer.File): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const imageBase64 = await FileToString(avatar);
    const folder: FolderNames = 'avatars_users';
    const publicId = `avatar.${id}`; // Generar un nuevo ID único para la imagen
    const urlImage = await this.cloudinary.uploadImage(imageBase64, folder, publicId);

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { avatar: urlImage },
    });

    // Invalidar caché
    await this.redis.del(`user:${id}`);
    await this.redis.delByPattern('users:*');

    return updatedUser;
  }

  async delete(id: string): Promise<User> {
    const deletedUser = await this.prisma.user.delete({ where: { id } });

    // Invalidar caché
    await this.redis.del(`user:${id}`);
    await this.redis.delByPattern('users:*');
    await this.redis.delByPattern(`user:${id}:*`);
    await this.redis.delByPattern('clients:all:*');

    return deletedUser;
  }

  async signin(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new Error('Credenciales inválidas');
    }

    return user;
  }

  async hasDocumentData(userId: string): Promise<boolean> {
    const cacheKey = `user:${userId}:has-document-data`;

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          include: { Document: true },
        });

        if (!user) {
          throw new Error('Usuario no encontrado');
        }

        // Comprueba si el usuario tiene documentos y si los campos son diferentes de "void"
        return user.Document.some(
          (document) =>
            document.documentSides !== 'No definido' &&
            document.number !== 'No definido',
        );
      },
      3600 // 1 hora de TTL
    );
  }

  async updateDocument(userId: string, documentSides: Express.Multer.File): Promise<User | null> {
    try {
      this.logger.log(`Iniciando actualización de documento para usuario ${userId}`);

      // Verificar que documentSides no sea null/undefined
      if (!documentSides || !documentSides.buffer) {
        this.logger.error('El archivo es inválido o está vacío');
        throw new Error('El archivo de documento es inválido');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { Document: true },
      });

      this.logger.log(`Usuario encontrado: ${!!user}, documentos: ${user?.Document?.length || 0}`);

      if (!user) throw new Error('Usuario no encontrado');
      if (!user.Document || user.Document.length === 0) {
        throw new Error('Usuario no tiene documentos registrados');
      }

      // Crear un ID único para el documento
      const upId = uuid.v4();
      this.logger.log(`ID generado para el documento: ${upId}`);

      // Preparar y verificar los datos antes de la subida
      this.logger.log('Preparando subida a GCS:', {
        fileSize: documentSides.size,
        mimeType: documentSides.mimetype,
        fileName: `ccScans-${userId}-${upId}.pdf`
      });

      // Subida de PDF a Google Cloud con mejor manejo de errores
      const uploadResult = await this.googleCloud.uploadToGcs({
        file: documentSides,
        userId,
        name: 'ccScans',
        upId,
        contentType: documentSides.mimetype,
      }).catch((error) => {
        // Log detallado del error
        this.logger.error(`Error específico en uploadToGcs: ${error.message}`, error);

        // Si es un error de autenticación o permisos
        if (error.message && error.message.includes('permission') || error.message.includes('auth')) {
          this.logger.error('Error de permisos o autenticación con Google Cloud');
        }

        // Si es un error de bucket no encontrado
        if (error.message && error.message.includes('bucket') || error.message.includes('not found')) {
          this.logger.error('Error con el bucket de Google Cloud');
        }

        return null;
      });

      this.logger.log('Resultado de la subida:', uploadResult);

      if (!uploadResult || typeof uploadResult !== 'object') {
        throw new Error('Error al subir el documento a Google Cloud Storage');
      }

      const { success, public_name } = uploadResult;

      this.logger.warn('Subida de documento a Google Cloud Storage:', { success, public_name });

      if (!success || !public_name) throw new Error('Error al subir el documento a Google Cloud Storage');

      // Actualiza los documentos del usuario
      try {
        const updatedDocuments = await Promise.all(user.Document.map((document) =>
          this.prisma.document.update({
            where: { id: document.id },
            data: {
              documentSides: public_name,
              upId,
            },
          })
        ));

        this.logger.warn('Documentos actualizados correctamente:', updatedDocuments.length);

        // Invalidar caché relacionada con documentos
        await this.redis.del(`user:${userId}`);
        await this.redis.del(`user:${userId}:has-document-data`);
        await this.redis.delByPattern(`user:${userId}:documents:*`);

        this.logger.log('Caché invalidada correctamente');

        const updatedUser = await this.prisma.user.findUnique({
          where: { id: userId },
          include: { Document: true },
        });

        this.logger.log('Usuario actualizado recuperado correctamente');

        return updatedUser;
      } catch (dbError) {
        this.logger.error('Error actualizando los documentos en la base de datos:', dbError);
        throw new Error(`Error al actualizar los documentos: ${dbError.message}`);
      }
    } catch (error) {
      this.logger.error(`Error general en updateDocument: ${error.message}`, error);
      throw error;
    }
  }

  async updateImageWithCC(userId: string, imageWithCC: Express.Multer.File): Promise<Document | null> {
    const document = await this.prisma.document.findFirst({
      where: { userId },
    });

    if (!document) {
      throw new Error('No se encontró documento para este usuario');
    }

    const imageBase64 = await FileToString(imageWithCC);
    const folder = 'images_with_cc';
    const publicId = `avatar.${userId}`; // Generar un nuevo ID único para la imagen
    const urlImage = await this.cloudinary.uploadImage(imageBase64, folder, publicId);

    const updatedDocument = await this.prisma.document.update({
      where: { id: document.id },
      data: { imageWithCC: urlImage },
    });

    // Invalidar caché relacionada con documentos
    await this.redis.del(`user:${userId}`);
    await this.redis.del(`user:${userId}:has-document-data`);
    await this.redis.del(`user:${userId}:document`);
    await this.redis.delByPattern(`user:${userId}:documents:*`);

    return updatedDocument;
  }

  async listDocuments(userId: string): Promise<Document[]> {
    const cacheKey = `user:${userId}:documents:list`;

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        const documents = await this.prisma.document.findMany({
          where: { userId: userId },
        });

        if (!documents) {
          throw new Error('No se encontraron documentos para este usuario');
        }

        return documents;
      },
      1800 // 30 minutos de TTL
    );
  }

  async getDocumentByUserId(userId: string): Promise<Document | null> {
    const cacheKey = `user:${userId}:document`;

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        return this.prisma.document.findFirst({
          where: { userId },
        });
      },
      1800 // 30 minutos de TTL
    );
  }

  async changeReject(loanApplicationId: string, reason: string) {
    const updatedLoan = await this.prisma.loanApplication.update({
      where: { id: loanApplicationId },
      data: { reasonReject: reason },
    });

    // Invalidar caché relacionada con préstamos
    await this.redis.delByPattern(`loan:${loanApplicationId}:*`);

    return updatedLoan;
  }

  async getAllClientsInfo(): Promise<{ id: string; email: string; names: string }[]> {
    const cacheKey = 'clients:all:info';

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        const clients = await this.prisma.user.findMany({
          select: {
            id: true,
            email: true,
            names: true,
          },
        });

        return clients.map((client) => ({
          id: client.id,
          email: client.email,
          names: client.names,
        }));
      },
      1800 // 30 minutos de TTL
    );
  }
}