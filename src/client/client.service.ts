import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Document, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { RedisService } from 'src/redis/redis.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService
  ) { }

  async create(data: CreateClientDto): Promise<User> {
    const existEmail = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existEmail) {
      throw new Error('El correo electrónico ya está en uso');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const newUser = await this.prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
        Document: {
          create: {},
        },
      },
    });

    // Invalidar caché relacionada con listados de usuarios
    await this.redis.delByPattern('users:*');
    await this.redis.delByPattern('clients:all:*');

    return newUser;
  }

  async get(id: string): Promise<User | null> {
    const cacheKey = `user:${id}`;

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        return this.prisma.user.findUnique({
          where: { id },
          include: { Document: true },
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
  ): Promise<{ users: User[]; totalCount: number }> {
    const cacheKey = `users:page:${page}:size:${pageSize}`;

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        try {
          const skip = (page - 1) * pageSize;

          // Añado logging para diagnóstico
          console.log(`Fetching users with skip=${skip}, take=${pageSize}`);

          const [users, totalCount] = await Promise.all([
            this.prisma.user.findMany({
              skip: skip,
              take: pageSize,
              include: { Document: true }, // Incluye documentos relacionados
            }),
            this.prisma.user.count(),
          ]);

          console.log(`Found ${users.length} users out of ${totalCount} total`);

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
    data: UpdateClientDto,
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

  async updateDocument(
    userId: string,
    documentSides: string,
    number: string,
  ): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { Document: true },
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Actualiza los documentos del usuario
    const updatedDocuments = user.Document.map((document) =>
      this.prisma.document.update({
        where: { id: document.id },
        data: {
          documentSides,
          number,
        },
      }),
    );

    await Promise.all(updatedDocuments);

    // Invalidar caché relacionada con documentos
    await this.redis.del(`user:${userId}`);
    await this.redis.del(`user:${userId}:has-document-data`);
    await this.redis.delByPattern(`user:${userId}:documents:*`);

    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { Document: true },
    });
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