import { Injectable, Logger, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Document, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
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
    private mail: MailService,
    private googleCloud: GoogleCloudService,
    private cloudinary: CloudinaryService,
  ) { }

  async create(data: User): Promise<User> {
    this.logger.debug('Iniciando creación de usuario', {
      email: data.email,
      hasRequiredFields: {
        names: !!data.names,
        firstLastName: !!data.firstLastName,
        secondLastName: !!data.secondLastName,
        currentCompanie: !!data.currentCompanie
      }
    });

    const existEmail = await this.prisma.user.findUnique({
      where: { email: data.email.trim() },
    });

    if (existEmail) {
      throw new ConflictException('El correo electrónico ya está en uso');
    }

    if (data.password.length < 6) {
      throw new BadRequestException('La contraseña debe tener mínimo 6 caracteres');
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
      await this.mail.sendNewClientMail({
        mail: data.email.trim(),
        completeName: `${data.names} ${data.firstLastName} ${data.secondLastName}`
      });
    } catch (emailError) {
      // Log the error but don't throw it to ensure user creation isn't affected
      console.error('Error sending welcome email, but user was created:', emailError);
      // Consider adding email to a resend queue or tracking failed emails
    }

    return newUser;
  }

  async get(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        Document: true,
        LoanApplication: {
          include: {
            GeneratedDocuments: true,
            EventLoanApplication: true
          }
        }
      },
    });
  }

  async searchUser(query: string): Promise<User[] | null> {
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
  }

  async all(
    page: number = 1,
    pageSize: number = 8,
    searchQuery?: string
  ): Promise<{ users: User[]; totalCount: number }> {
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
  }

  async update(id: string, data: any): Promise<User> {
    // console.log("Datos recibidos en update:", JSON.stringify(data, null, 2));

    // Filtrar campos principales (sin Document)
    const allowedFields = [
      'email', 'names', 'firstLastName', 'secondLastName', 'currentCompanie',
      'avatar', 'phone', 'residence_phone_number', 'phone_whatsapp', 'birth_day',
      'genre', 'residence_address', 'city', 'isBan'
    ];

    const filteredData: any = {};

    // Filtrar campos permitidos (excluyendo Document)
    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key)) {
        filteredData[key] = value;
      }
    }

    // Conversión de birth_day
    if (filteredData.birth_day && typeof filteredData.birth_day === 'string') {
      filteredData.birth_day = new Date(filteredData.birth_day);
    }

    // Manejar actualización de documentos usando sintaxis de Prisma
    if (data.Document && Array.isArray(data.Document)) {
      const documents = data.Document;

      // Preparar operaciones para documentos con tipo explícito
      const documentOperations: Array<{
        where: { id: string };
        data: {
          documentSides?: string;
          upId?: string;
          imageWithCC?: string;
          typeDocument?: string;
          number?: string;
        };
      }> = [];

      for (const docData of documents) {
        if (docData.id) {
          // Si el documento tiene ID, actualizarlo
          documentOperations.push({
            where: { id: docData.id },
            data: {
              documentSides: docData.documentSides || "No definido",
              upId: docData.upId || "No definido",
              imageWithCC: docData.imageWithCC || "No definido",
              typeDocument: docData.typeDocument || "CC",
              number: docData.number || "No definido"
            }
          });
        }
      }

      // Solo agregar Document si hay operaciones
      if (documentOperations.length > 0) {
        filteredData.Document = {
          update: documentOperations
        };
      }
    }

    console.log("Datos finales para Prisma:", JSON.stringify(filteredData, null, 2));

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id },
        data: filteredData,
        include: { Document: true }
      });

      this.logger.log(`Usuario actualizado: ${id}`, filteredData);
      return updatedUser;

    } catch (prismaError) {
      console.error("Error de Prisma:", prismaError);
      throw new Error(`Error al actualizar usuario: ${prismaError.message}`);
    }
  }

  async updatePassword(id: string, password: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    return this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });
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

    return this.prisma.user.update({
      where: { id },
      data: { avatar: urlImage },
    });
  }

  async delete(id: string): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      // First, delete related GeneratedDocuments
      const loanApplications = await tx.loanApplication.findMany({
        where: { userId: id },
        select: { id: true }
      });

      for (const loan of loanApplications) {
        await tx.generatedDocuments.deleteMany({
          where: { loanId: loan.id }
        });
        await tx.eventLoanApplication.deleteMany({
          where: { loanId: loan.id }
        });
      }

      // Delete LoanApplications
      await tx.loanApplication.deleteMany({
        where: { userId: id }
      });

      // Delete PreLoanApplications
      await tx.preLoanApplication.deleteMany({
        where: { userId: id }
      });

      // Delete Documents
      await tx.document.deleteMany({
        where: { userId: id }
      });

      // Finally, delete the User
      return tx.user.delete({
        where: { id }
      });
    });
  }

  async signin(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new Error('Credenciales inválidas');
    }

    return user;
  }

  async hasDocumentData(userId: string): Promise<boolean> {
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
  }

  async updateDocument(userId: string, documentFile: Express.Multer.File): Promise<User | null> {
    try {
      this.logger.log(`Iniciando actualización de documento para usuario ${userId}`);

      // Validación detallada del archivo
      if (!documentFile) {
        this.logger.error('El archivo es nulo');
        throw new Error('No se recibió ningún archivo');
      }

      if (!documentFile.buffer || documentFile.buffer.length === 0) {
        this.logger.error(`El archivo está vacío o corrupto: tamaño=${documentFile.size}, mimetype=${documentFile.mimetype}`);
        throw new Error('El archivo está vacío o corrupto');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { Document: true },
      });

      this.logger.log(`Usuario encontrado: ${!!user}, documentos: ${user?.Document?.length || 0}`);

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      if (!user.Document || user.Document.length === 0) {
        this.logger.warn(`Usuario ${userId} no tiene documentos registrados`);
        throw new Error('Usuario no tiene documentos registrados');
      }

      // Crear un ID único para el documento
      const upId = uuid.v4();

      // Determinar la extensión del archivo basada en su mimetype
      let extension = 'pdf';
      if (documentFile.mimetype.includes('jpeg') || documentFile.mimetype.includes('jpg')) {
        extension = 'jpg';
      } else if (documentFile.mimetype.includes('png')) {
        extension = 'png';
      }

      const fileName = `ccScans-${userId}-${upId}.${extension}`;

      this.logger.log('Preparando subida a GCS:', {
        fileSize: documentFile.size,
        mimeType: documentFile.mimetype,
        fileName
      });

      // Implementar reintentos para la subida a Google Cloud
      let uploadAttempt = 0;
      const MAX_ATTEMPTS = 3;
      let uploadResult: { success: boolean; public_name: string } | null = null;

      while (uploadAttempt < MAX_ATTEMPTS && !uploadResult) {
        uploadAttempt++;
        this.logger.log(`Intento de subida a GCS #${uploadAttempt}`);

        try {
          uploadResult = await this.googleCloud.uploadToGcs({
            file: documentFile,
            userId,
            name: 'ccScans',
            upId,
            contentType: documentFile.mimetype,
          });
        } catch (uploadError) {
          this.logger.error(`Error en intento ${uploadAttempt} de subida a GCS: ${uploadError.message}`, uploadError);

          if (uploadAttempt === MAX_ATTEMPTS) {
            throw new Error(`Error al subir el documento después de ${MAX_ATTEMPTS} intentos: ${uploadError.message}`);
          }

          // Esperar un poco antes del siguiente intento
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      this.logger.log('Resultado de la subida:', uploadResult);

      if (!uploadResult || typeof uploadResult !== 'object') {
        throw new Error('Error al subir el documento a Google Cloud Storage');
      }

      const { success, public_name } = uploadResult;

      this.logger.log('Subida de documento a Google Cloud Storage:', { success, public_name });

      if (!success || !public_name) {
        throw new Error('Error al subir el documento a Google Cloud Storage');
      }

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

        this.logger.log('Documentos actualizados correctamente:', updatedDocuments.length);

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
    try {
      this.logger.log(`Iniciando actualización de selfie para usuario ${userId}`);

      // Validación detallada del archivo
      if (!imageWithCC) {
        this.logger.error('La imagen es nula');
        throw new Error('No se recibió ninguna imagen');
      }

      if (!imageWithCC.buffer || imageWithCC.buffer.length === 0) {
        this.logger.error(`La imagen está vacía o corrupta: tamaño=${imageWithCC.size}, mimetype=${imageWithCC.mimetype}`);
        throw new Error('La imagen está vacía o corrupta');
      }

      // Buscar el documento del usuario
      const document = await this.prisma.document.findFirst({
        where: { userId },
      });

      if (!document) {
        this.logger.warn(`No se encontró documento para el usuario ${userId}`);
        throw new Error('No se encontró documento para este usuario');
      }

      this.logger.log('Documento encontrado, procediendo a convertir imagen');

      // Procesamiento de imagen optimizado
      let imageBase64;
      try {
        // Convertir el archivo a base64
        imageBase64 = await this.FileToString(imageWithCC);

        // Validación del formato base64
        if (!imageBase64 || !imageBase64.startsWith('data:image/')) {
          throw new Error('Error al convertir imagen a formato válido');
        }

        this.logger.log('Imagen convertida correctamente a base64');

        // Log parcial del string base64 para debugging (solo los primeros 100 caracteres)
        const base64Preview = imageBase64.substring(0, 100) + '...';
        this.logger.log(`Base64 preview: ${base64Preview}`);
      } catch (conversionError) {
        this.logger.error('Error al convertir imagen:', conversionError);
        throw new Error('Error al procesar la imagen. El formato no es compatible.');
      }

      // Implementar reintentos para la subida a Cloudinary
      let uploadAttempt = 0;
      const MAX_ATTEMPTS = 3;
      let urlImage: string | null = null;

      const folder = 'images_with_cc';
      const publicId = `selfie-${userId}-${Date.now()}`; // Añadir timestamp para evitar problemas de caché

      this.logger.log('Configuración para subida a Cloudinary:', {
        folder,
        publicId
      });

      while (uploadAttempt < MAX_ATTEMPTS && !urlImage) {
        uploadAttempt++;
        this.logger.log(`Intento de subida a Cloudinary #${uploadAttempt}`);

        try {
          // Subir imagen a Cloudinary con más información de depuración
          this.logger.log(`Iniciando subida a Cloudinary: intento=${uploadAttempt}, tamaño=${imageBase64.length}`);

          urlImage = await this.cloudinary.uploadImage(imageBase64, folder, publicId);

          if (!urlImage) {
            throw new Error('URL de imagen vacía devuelta por Cloudinary');
          }

          this.logger.log(`Imagen subida correctamente a Cloudinary: ${urlImage.substring(0, 60)}...`);
        } catch (uploadError) {
          this.logger.error(`Error en intento ${uploadAttempt} de subida a Cloudinary: ${uploadError.message}`);

          if (uploadAttempt === MAX_ATTEMPTS) {
            throw new Error(`Error al subir imagen después de ${MAX_ATTEMPTS} intentos: ${uploadError.message}`);
          }

          // Esperar un poco antes del siguiente intento (con backoff exponencial)
          const waitTime = 1000 * Math.pow(2, uploadAttempt - 1);
          this.logger.log(`Esperando ${waitTime}ms antes del siguiente intento`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      // Actualizar el documento en la base de datos
      try {
        this.logger.log(`Actualizando documento en base de datos: documentId=${document.id}`);

        const updatedDocument = await this.prisma.document.update({
          where: { id: document.id },
          data: { imageWithCC: urlImage ?? 'No definido' },
        });

        this.logger.log('Documento actualizado correctamente con la nueva selfie');

        return updatedDocument;
      } catch (dbError) {
        this.logger.error('Error actualizando el documento en la base de datos:', dbError);
        throw new Error(`Error al guardar la imagen en la base de datos: ${dbError.message}`);
      }
    } catch (error) {
      this.logger.error(`Error general en updateImageWithCC: ${error.message}`, error);
      throw error;
    }
  }

  async listDocuments(userId: string): Promise<Document[]> {
    const documents = await this.prisma.document.findMany({
      where: { userId: userId },
    });

    if (!documents) {
      throw new Error('No se encontraron documentos para este usuario');
    }

    return documents;
  }

  async getDocumentByUserId(userId: string): Promise<Document | null> {
    return this.prisma.document.findFirst({
      where: { userId },
    });
  }

  async changeReject(loanApplicationId: string, reason: string) {
    return this.prisma.loanApplication.update({
      where: { id: loanApplicationId },
      data: { reasonReject: reason },
    });
  }

  async getAllClientsInfo(): Promise<{ id: string; email: string; names: string }[]> {
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
  }

  // auxiliary methods

  /**
   * Convertir File a Base64
   * @param file 
   * @returns 
   */
  private async FileToString(file: Express.Multer.File): Promise<string> {
    if (!file || !file.buffer) {
      throw new Error('Archivo inválido o vacío');
    }

    // Obtener el tipo MIME correcto o usar un predeterminado seguro
    const mimeType = file.mimetype || 'image/jpeg';

    // Convertir buffer a base64
    const base64 = file.buffer.toString('base64');

    // Crear string base64 con el formato correcto
    const base64String = `data:${mimeType};base64,${base64}`;

    // Validación básica del resultado
    if (!base64String.startsWith(`data:${mimeType};base64,`)) {
      throw new Error('Error en la conversión a base64');
    }

    return base64String;
  }
}