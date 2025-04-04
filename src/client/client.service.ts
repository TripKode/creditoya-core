import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Document, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export type CreateClientDto = {
  email: string;
  password: string;
  names: string;
  firstLastName: string;
  secondLastName: string;
  phone?: string;
};

export type UpdateClientDto = Omit<CreateClientDto, 'password'>;

@Injectable()
export class ClientService {
  constructor(private prisma: PrismaService) { }

  async create(data: CreateClientDto): Promise<User> {
    const existEmail = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existEmail) {
      throw new Error('El correo electrónico ya está en uso');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
        Document: {
          create: {},
        },
      },
    });
  }

  async get(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { Document: true },
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
  ): Promise<{ users: User[]; totalCount: number }> {
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
  }

  async update(
    id: string,
    data: UpdateClientDto,
  ): Promise<User> {
    return await this.prisma.user.update({ where: { id }, data });
  }

  async updatePassword(id: string, password: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    return this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });
  }

  async delete(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
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

    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { Document: true },
    });
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

  async getAllClientsInfo(): Promise<
    { id: string; email: string; names: string }[]
  > {
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
}