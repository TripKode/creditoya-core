import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DevService {
  constructor(private readonly prisma: PrismaService) { }
  /**
   * Método para limpiar campos problemáticos de todos los usuarios
   * Elimina los campos que están causando conflictos de tipo de datos
   */
  async cleanupUserFields(): Promise<{ success: boolean; message: string; affectedUsers: number }> {
    try {
      console.log('Iniciando limpieza de campos problemáticos en User...');

      // Primero, contar cuántos usuarios serán afectados
      const totalUsers = await this.prisma.$runCommandRaw({
        count: 'User',
        query: {}
      });

      console.log(`Total de usuarios a procesar: ${totalUsers.n}`);

      // Eliminar los campos problemáticos usando $unset
      const result = await this.prisma.$runCommandRaw({
        update: 'User',
        updates: [
          {
            q: {}, // Filtro vacío para afectar todos los documentos
            u: {
              $unset: {
                phone: "",
                residence_phone_number: "",
                phone_whatsapp: "",
                genre: "",
                residence_address: "",
                city: ""
              }
            },
            multi: true // Actualizar múltiples documentos
          }
        ]
      });

      console.log('Resultado de la operación:', result);

      // Verificar que los campos fueron eliminados
      const verification = await this.prisma.$runCommandRaw({
        find: 'User',
        filter: {
          $or: [
            { phone: { $exists: true } },
            { residence_phone_number: { $exists: true } },
            { phone_whatsapp: { $exists: true } },
            { genre: { $exists: true } },
            { residence_address: { $exists: true } },
            { city: { $exists: true } }
          ]
        },
        limit: 1
      });

      let remainingFieldsCount = 0;
      if (
        verification.cursor &&
        typeof verification.cursor === 'object' &&
        'firstBatch' in verification.cursor &&
        Array.isArray((verification.cursor as any).firstBatch)
      ) {
        remainingFieldsCount = ((verification.cursor as any).firstBatch).length;
      }

      if (remainingFieldsCount === 0) {
        const message = `✅ Limpieza completada exitosamente. ${totalUsers.n} usuarios procesados.`;
        console.log(message);

        return {
          success: true,
          message,
          affectedUsers: typeof totalUsers.n === 'number' ? totalUsers.n : 0
        };
      } else {
        const message = `⚠️ Limpieza parcial. Algunos campos aún existen.`;
        console.log(message);

        return {
          success: false,
          message,
          affectedUsers: typeof totalUsers.n === 'number' ? totalUsers.n : 0
        };
      }

    } catch (error) {
      console.error('Error durante la limpieza de campos:', error);

      return {
        success: false,
        message: `❌ Error durante la limpieza: ${error.message}`,
        affectedUsers: 0
      };
    }
  }

  /**
   * Método alternativo más específico que elimina campos uno por uno
   * Útil si el método anterior no funciona como esperado
   */
  async cleanupUserFieldsStepByStep(): Promise<{ success: boolean; details: any[] }> {
    const fieldsToRemove = [
      'phone',
      'residence_phone_number',
      'phone_whatsapp',
      'genre',
      'residence_address',
      'city'
    ];

    const results: {
      field: string;
      documentsWithFieldBefore: any;
      documentsWithFieldAfter: any;
      success: boolean;
      updateResult: any;
    }[] = [];

    try {
      for (const field of fieldsToRemove) {
        console.log(`Eliminando campo: ${field}`);

        // Contar documentos que tienen este campo
        const countBefore = await this.prisma.$runCommandRaw({
          count: 'User',
          query: { [field]: { $exists: true } }
        });

        // Eliminar el campo
        const updateResult = await this.prisma.$runCommandRaw({
          update: 'User',
          updates: [
            {
              q: { [field]: { $exists: true } },
              u: { $unset: { [field]: "" } },
              multi: true
            }
          ]
        });

        // Verificar que se eliminó
        const countAfter = await this.prisma.$runCommandRaw({
          count: 'User',
          query: { [field]: { $exists: true } }
        });

        const fieldResult = {
          field,
          documentsWithFieldBefore: countBefore.n,
          documentsWithFieldAfter: countAfter.n,
          success: countAfter.n === 0,
          updateResult
        };

        results.push(fieldResult);
        console.log(`Campo ${field}: ${countBefore.n} → ${countAfter.n} documentos`);
      }

      const allSuccess = results.every(r => r.success);

      return {
        success: allSuccess,
        details: results
      };

    } catch (error) {
      console.error('Error en limpieza paso a paso:', error);
      return {
        success: false,
        details: results
      };
    }
  }

  /**
   * Método para verificar el estado actual de los campos
   */
  async verifyUserFieldsStatus(): Promise<any> {
    try {
      const fieldsToCheck = [
        'phone',
        'residence_phone_number',
        'phone_whatsapp',
        'genre',
        'residence_address',
        'city'
      ];

      const status = {};

      for (const field of fieldsToCheck) {
        const count = await this.prisma.$runCommandRaw({
          count: 'User',
          query: { [field]: { $exists: true } }
        });

        const documentsWithField = typeof count.n === 'number' ? count.n : 0;
        status[field] = {
          documentsWithField,
          exists: documentsWithField > 0
        };
      }

      // Total de usuarios
      const totalUsers = await this.prisma.$runCommandRaw({
        count: 'User',
        query: {}
      });

      return {
        totalUsers: totalUsers.n,
        fieldStatus: status,
        allFieldsRemoved: Object.values(status).every((s: any) => s.documentsWithField === 0)
      };

    } catch (error) {
      console.error('Error verificando estado de campos:', error);
      return { error: error.message };
    }
  }

  /**
 * Método específico para arreglar campos null en el modelo User
 * Convierte valores null a valores por defecto o elimina campos problemáticos
 */
  async fixUserNullFields(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      console.log('Iniciando corrección de campos null en User...');

      // Primero verificar cuántos usuarios tienen campos null
      const usersWithNullFields = await this.prisma.$runCommandRaw({
        find: 'User',
        filter: {
          $or: [
            { city: null },
            { phone: null },
            { residence_phone_number: null },
            { phone_whatsapp: null },
            { genre: null },
            { residence_address: null }
          ]
        }
      });

      let affectedCount = 0;
      if (usersWithNullFields.cursor &&
        typeof usersWithNullFields.cursor === 'object' &&
        'firstBatch' in usersWithNullFields.cursor &&
        Array.isArray((usersWithNullFields.cursor as any).firstBatch)) {
        affectedCount = (usersWithNullFields.cursor as any).firstBatch.length;
      }

      console.log(`Usuarios con campos null encontrados: ${affectedCount}`);

      if (affectedCount === 0) {
        return {
          success: true,
          message: 'No se encontraron usuarios con campos null',
          details: { affectedUsers: 0 }
        };
      }

      // Opción 1: Eliminar completamente los campos problemáticos
      const unsetResult = await this.prisma.$runCommandRaw({
        update: 'User',
        updates: [
          {
            q: {
              $or: [
                { city: null },
                { phone: null },
                { residence_phone_number: null },
                { phone_whatsapp: null },
                { genre: null },
                { residence_address: null }
              ]
            },
            u: {
              $unset: {
                city: "",
                phone: "",
                residence_phone_number: "",
                phone_whatsapp: "",
                genre: "",
                residence_address: ""
              }
            },
            multi: true
          }
        ]
      });

      // Verificar que se corrigieron
      const verificationAfter = await this.prisma.$runCommandRaw({
        find: 'User',
        filter: {
          $or: [
            { city: null },
            { phone: null },
            { residence_phone_number: null },
            { phone_whatsapp: null },
            { genre: null },
            { residence_address: null }
          ]
        }
      });

      let remainingNullFields = 0;
      if (verificationAfter.cursor &&
        typeof verificationAfter.cursor === 'object' &&
        'firstBatch' in verificationAfter.cursor &&
        Array.isArray((verificationAfter.cursor as any).firstBatch)) {
        remainingNullFields = (verificationAfter.cursor as any).firstBatch.length;
      }

      const success = remainingNullFields === 0;
      const message = success
        ? `✅ Corrección completada. ${affectedCount} usuarios corregidos.`
        : `⚠️ Corrección parcial. ${remainingNullFields} usuarios aún tienen campos null.`;

      console.log(message);

      return {
        success,
        message,
        details: {
          affectedUsers: affectedCount,
          remainingNullFields,
          updateResult: unsetResult
        }
      };

    } catch (error) {
      console.error('Error corrigiendo campos null:', error);
      return {
        success: false,
        message: `❌ Error durante la corrección: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
 * Método para convertir el campo phone de string a string[] en PreLoanApplication y LoanApplication
 * Maneja casos donde phone puede ser string, undefined o ya ser un array
 */
  async convertPhoneFields(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      console.log('Iniciando conversión de campos phone de string a string[]...');

      const results = {
        preLoanApplication: {
          converted: 0,
          alreadyArray: 0,
          noPhoneField: 0,
          errors: 0
        },
        loanApplication: {
          converted: 0,
          alreadyArray: 0,
          noPhoneField: 0,
          errors: 0
        }
      };

      // Convertir phone en PreLoanApplication
      console.log('Procesando PreLoanApplication...');

      // Buscar documentos con phone como string
      const preLoanWithStringPhone = await this.prisma.$runCommandRaw({
        find: 'PreLoanApplication',
        filter: {
          phone: { $type: "string" } // Solo documentos donde phone es string
        }
      });

      if (preLoanWithStringPhone.cursor &&
        typeof preLoanWithStringPhone.cursor === 'object' &&
        'firstBatch' in preLoanWithStringPhone.cursor &&
        Array.isArray((preLoanWithStringPhone.cursor as any).firstBatch)) {

        const documents = (preLoanWithStringPhone.cursor as any).firstBatch;

        for (const doc of documents) {
          try {
            // Convertir string a array
            const phoneArray = doc.phone ? [doc.phone] : [];

            await this.prisma.$runCommandRaw({
              update: 'PreLoanApplication',
              updates: [{
                q: { _id: doc._id },
                u: { $set: { phone: phoneArray } }
              }]
            });

            results.preLoanApplication.converted++;
          } catch (error) {
            console.error(`Error convirtiendo PreLoanApplication ${doc._id}:`, error);
            results.preLoanApplication.errors++;
          }
        }
      }

      // Contar documentos que ya tienen phone como array en PreLoanApplication
      const preLoanWithArrayPhone = await this.prisma.$runCommandRaw({
        count: 'PreLoanApplication',
        query: { phone: { $type: "array" } }
      });
      results.preLoanApplication.alreadyArray = typeof preLoanWithArrayPhone.n === 'number' ? preLoanWithArrayPhone.n : 0;

      // Contar documentos sin campo phone en PreLoanApplication
      const preLoanWithoutPhone = await this.prisma.$runCommandRaw({
        count: 'PreLoanApplication',
        query: { phone: { $exists: false } }
      });
      results.preLoanApplication.noPhoneField = typeof preLoanWithoutPhone.n === 'number' ? preLoanWithoutPhone.n : 0;

      // Convertir phone en LoanApplication
      console.log('Procesando LoanApplication...');

      // Buscar documentos con phone como string
      const loanWithStringPhone = await this.prisma.$runCommandRaw({
        find: 'LoanApplication',
        filter: {
          phone: { $type: "string" } // Solo documentos donde phone es string
        }
      });

      if (loanWithStringPhone.cursor &&
        typeof loanWithStringPhone.cursor === 'object' &&
        'firstBatch' in loanWithStringPhone.cursor &&
        Array.isArray((loanWithStringPhone.cursor as any).firstBatch)) {

        const documents = (loanWithStringPhone.cursor as any).firstBatch;

        for (const doc of documents) {
          try {
            // Convertir string a array
            const phoneArray = doc.phone ? [doc.phone] : [];

            await this.prisma.$runCommandRaw({
              update: 'LoanApplication',
              updates: [{
                q: { _id: doc._id },
                u: { $set: { phone: phoneArray } }
              }]
            });

            results.loanApplication.converted++;
          } catch (error) {
            console.error(`Error convirtiendo LoanApplication ${doc._id}:`, error);
            results.loanApplication.errors++;
          }
        }
      }

      // Contar documentos que ya tienen phone como array en LoanApplication
      const loanWithArrayPhone = await this.prisma.$runCommandRaw({
        count: 'LoanApplication',
        query: { phone: { $type: "array" } }
      });
      results.loanApplication.alreadyArray = typeof loanWithArrayPhone.n === 'number' ? loanWithArrayPhone.n : 0;

      // Contar documentos sin campo phone en LoanApplication
      const loanWithoutPhone = await this.prisma.$runCommandRaw({
        count: 'LoanApplication',
        query: { phone: { $exists: false } }
      });
      results.loanApplication.noPhoneField = typeof loanWithoutPhone.n === 'number' ? loanWithoutPhone.n : 0;

      const totalConverted = results.preLoanApplication.converted + results.loanApplication.converted;
      const totalErrors = results.preLoanApplication.errors + results.loanApplication.errors;

      const success = totalErrors === 0;
      const message = success
        ? `✅ Conversión completada exitosamente. ${totalConverted} campos phone convertidos.`
        : `⚠️ Conversión completada con ${totalErrors} errores. ${totalConverted} campos convertidos.`;

      console.log(message);
      console.log('Detalles:', results);

      return {
        success,
        message,
        details: results
      };

    } catch (error) {
      console.error('Error durante la conversión de campos phone:', error);
      return {
        success: false,
        message: `❌ Error durante la conversión: ${error.message}`,
        details: null
      };
    }
  }

  /**
   * Método para verificar el estado actual de los campos phone
   */
  async verifyPhoneFieldsStatus(): Promise<any> {
    try {
      const status: {
        preLoanApplication: {
          total?: number;
          phoneAsString?: number;
          phoneAsArray?: number;
          noPhoneField?: number;
          needsConversion?: boolean;
        };
        loanApplication: {
          total?: number;
          phoneAsString?: number;
          phoneAsArray?: number;
          noPhoneField?: number;
          needsConversion?: boolean;
        };
      } = {
        preLoanApplication: {},
        loanApplication: {}
      };

      // Verificar PreLoanApplication
      const preLoanStringCount = await this.prisma.$runCommandRaw({
        count: 'PreLoanApplication',
        query: { phone: { $type: "string" } }
      });

      const preLoanArrayCount = await this.prisma.$runCommandRaw({
        count: 'PreLoanApplication',
        query: { phone: { $type: "array" } }
      });

      const preLoanNoPhoneCount = await this.prisma.$runCommandRaw({
        count: 'PreLoanApplication',
        query: { phone: { $exists: false } }
      });

      const preLoanTotalCount = await this.prisma.$runCommandRaw({
        count: 'PreLoanApplication',
        query: {}
      });

      status.preLoanApplication = {
        total: typeof preLoanTotalCount.n === 'number' ? preLoanTotalCount.n : 0,
        phoneAsString: typeof preLoanStringCount.n === 'number' ? preLoanStringCount.n : 0,
        phoneAsArray: typeof preLoanArrayCount.n === 'number' ? preLoanArrayCount.n : 0,
        noPhoneField: typeof preLoanNoPhoneCount.n === 'number' ? preLoanNoPhoneCount.n : 0,
        needsConversion: (typeof preLoanStringCount.n === 'number' ? preLoanStringCount.n : 0) > 0
      };

      // Verificar LoanApplication
      const loanStringCount = await this.prisma.$runCommandRaw({
        count: 'LoanApplication',
        query: { phone: { $type: "string" } }
      });

      const loanArrayCount = await this.prisma.$runCommandRaw({
        count: 'LoanApplication',
        query: { phone: { $type: "array" } }
      });

      const loanNoPhoneCount = await this.prisma.$runCommandRaw({
        count: 'LoanApplication',
        query: { phone: { $exists: false } }
      });

      const loanTotalCount = await this.prisma.$runCommandRaw({
        count: 'LoanApplication',
        query: {}
      });

      status.loanApplication = {
        total: typeof loanTotalCount.n === 'number' ? loanTotalCount.n : 0,
        phoneAsString: typeof loanStringCount.n === 'number' ? loanStringCount.n : 0,
        phoneAsArray: typeof loanArrayCount.n === 'number' ? loanArrayCount.n : 0,
        noPhoneField: typeof loanNoPhoneCount.n === 'number' ? loanNoPhoneCount.n : 0,
        needsConversion: (typeof loanStringCount.n === 'number' ? loanStringCount.n : 0) > 0
      };

      const overallNeedsConversion = status.preLoanApplication.needsConversion || status.loanApplication.needsConversion;

      return {
        status,
        needsConversion: overallNeedsConversion,
        summary: {
          totalDocuments: (status.preLoanApplication.total ?? 0) + (status.loanApplication.total ?? 0),
          totalPhoneAsString: (status.preLoanApplication.phoneAsString ?? 0) + (status.loanApplication.phoneAsString ?? 0),
          totalPhoneAsArray: (status.preLoanApplication.phoneAsArray ?? 0) + (status.loanApplication.phoneAsArray ?? 0),
          totalNoPhoneField: (status.preLoanApplication.noPhoneField ?? 0) + (status.loanApplication.noPhoneField ?? 0)
        }
      };

    } catch (error) {
      console.error('Error verificando estado de campos phone:', error);
      return { error: error.message };
    }
  }
}
