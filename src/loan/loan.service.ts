import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLoanApplicationDto, PreCreateLoanApplicationDto } from './dto/create-loan.dto';
import { MailService } from 'src/mail/mail.service';
import { PdfsService } from 'src/pdfs/pdfs.service';
import { GoogleCloudService } from 'src/gcp/gcp.service';
import { RandomUpIdsGenerator } from 'handlers/GenerateUpIds';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { ILoanApplication, LoanStatus } from 'types/full';

@Injectable()
export class LoanService {
  private logger = new Logger(LoanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly pdfService: PdfsService,
    private readonly gcpService: GoogleCloudService,
    private readonly cloudinary: CloudinaryService,
  ) { }

  // Método para crear una solicitud de préstamo
  private async create(data: CreateLoanApplicationDto): Promise<ILoanApplication> {
    const startTime = Date.now();

    try {
      this.logger.debug('Iniciando creación de solicitud de préstamo', {
        event: 'loan_creation_start',
        userId: data.userId,
        entity: data.entity,
        amount: data.cantity
      });

      // Primero, obtener el usuario para verificar si es de valor_agregado
      const user = await this.prisma.user.findUnique({
        where: {
          id: data.userId,
        },
        select: {
          id: true,
          email: true,
          names: true,
          firstLastName: true,
          secondLastName: true,
          currentCompanie: true,
          Document: true
        }
      });

      if (!user) {
        this.logger.warn('Usuario no encontrado durante creación de préstamo', {
          event: 'user_not_found',
          userId: data.userId
        });
        throw new BadRequestException("Usuario no encontrado");
      }

      // Verificar directamente si el usuario es de valor_agregado
      const isValorAgregadoUser = user.currentCompanie === 'valor_agregado';

      this.logger.debug('Información del usuario obtenida', {
        event: 'user_info_retrieved',
        userId: user.id,
        company: user.currentCompanie,
        isValorAgregado: isValorAgregadoUser,
        email: user.email
      });

      // Validación solo para usuarios que NO son de valor agregado
      if (!isValorAgregadoUser) {
        this.logger.debug('Ejecutando validaciones para usuario regular', {
          event: 'regular_user_validation',
          hasLaborCard: !!data.labor_card,
          hasFirstFlyer: !!data.fisrt_flyer,
          hasSecondFlyer: !!data.second_flyer,
          hasThirdFlyer: !!data.third_flyer
        });

        // Verificar los volantes de pago
        const hasAllFlyers = data.fisrt_flyer && data.second_flyer && data.third_flyer;

        // Si no tiene carta laboral y tampoco todos los volantes
        if (!data.labor_card && !hasAllFlyers) {
          this.logger.warn('Documentos insuficientes - falta carta laboral y volantes', {
            event: 'insufficient_documents',
            userId: data.userId,
            hasLaborCard: false,
            hasAllFlyers: false
          });
          throw new BadRequestException("Porfavor sube la carta laboral y los volantes de pago");
        }

        // Si tiene carta laboral pero faltan volantes
        if (!hasAllFlyers) {
          this.logger.warn('Documentos insuficientes - faltan volantes de pago', {
            event: 'missing_flyers',
            userId: data.userId,
            hasLaborCard: !!data.labor_card,
            flyersStatus: {
              first: !!data.fisrt_flyer,
              second: !!data.second_flyer,
              third: !!data.third_flyer
            }
          });
          throw new BadRequestException("Porfavor sube los volantes de pago");
        }
      } else {
        this.logger.debug('Usuario valor_agregado - omitiendo validaciones de documentos', {
          event: 'valor_agregado_user_skip_validation',
          userId: data.userId,
          company: user.currentCompanie
        });
      }

      // Crear el préstamo en la base de datos
      this.logger.debug('Creando préstamo en base de datos', {
        event: 'creating_loan_record',
        userId: data.userId
      });

      // Log específico antes de guardar en LoanApplication
      this.logger.debug('🏠 [LOAN_SERVICE] Datos a guardar en LoanApplication:', {
        event: 'saving_to_loan_database',
        userId: data.userId,
        city: {
          value: data.city,
          type: typeof data.city,
          willBeSaved: data.city || null
        },
        residence_address: {
          value: data.residence_address,
          type: typeof data.residence_address,
          willBeSaved: data.residence_address || null
        }
      });

      const newLoan = await this.prisma.loanApplication.create({
        data: {
          // Conectar con el usuario usando el ID
          user: {
            connect: { id: data.userId },
          },
          // Datos principales del préstamo
          phone: data.phone,
          entity: data.entity,
          bankNumberAccount: data.bankNumberAccount,
          cantity: data.cantity,
          terms_and_conditions: data.terms_and_conditions,
          signature: data.signature,
          city: data.city || null,
          residence_address: data.residence_address || null,
          upSignatureId: data.upSignatureId,
          status: LoanStatus.PENDING,

          // Documentos y sus IDs - usando null para valores opcionales
          fisrt_flyer: data.fisrt_flyer || null,
          upid_first_flyer: data.upid_first_flayer || null,
          second_flyer: data.second_flyer || null,
          upid_second_flyer: data.upid_second_flyer || null,
          third_flyer: data.third_flyer || null,
          upid_third_flyer: data.upid_third_flayer || null,
          labor_card: data.labor_card || null,
          upid_labor_card: data.upid_labor_card || null,
        },
        include: { user: true },
      });

      // Log específico después de guardar en LoanApplication
      this.logger.debug('🏠 [LOAN_SERVICE] Datos guardados en LoanApplication:', {
        event: 'saved_to_loan_database',
        loanId: newLoan.id,
        userId: data.userId,
        city: {
          saved: newLoan.city,
          type: typeof newLoan.city
        },
        residence_address: {
          saved: newLoan.residence_address,
          type: typeof newLoan.residence_address
        }
      });

      this.logger.debug('Préstamo creado exitosamente en base de datos', {
        event: 'loan_created_success',
        loanId: newLoan.id,
        userId: data.userId,
        status: newLoan.status,
        amount: newLoan.cantity
      });

      // Generar PDFs antes de enviar el correo
      try {
        this.logger.debug('Iniciando generación de PDFs', {
          event: 'pdf_generation_start',
          loanId: newLoan.id,
          userId: data.userId
        });

        // Preparar parámetros de los documentos usando los datos del usuario ya obtenidos
        const documentsParams = [
          // Documento sobre el préstamo
          {
            documentType: 'about-loan',
            signature: newLoan.signature,
            numberDocument: user.Document[0]?.number ?? '',
            entity: newLoan.entity,
            accountNumber: newLoan.bankNumberAccount,
            userId: data.userId,
          } as any,
          // Carta de instrucciones
          {
            documentType: 'instruction-letter',
            signature: newLoan.signature,
            numberDocument: user.Document[0]?.number ?? '',
            name: `${user.names} ${user.firstLastName} ${user.secondLastName}`,
            userId: data.userId,
          } as any,
          // Autorización de pago de salario
          {
            documentType: 'salary-payment-authorization',
            signature: newLoan.signature,
            numberDocument: user.Document[0]?.number ?? '',
            name: `${user.names} ${user.firstLastName} ${user.secondLastName}`,
            userId: data.userId,
          } as any,
          // Pagaré
          {
            documentType: 'promissory-note',
            signature: newLoan.signature,
            numberDocument: user.Document[0]?.number ?? '',
            name: `${user.names} ${user.firstLastName} ${user.secondLastName}`,
            userId: data.userId
          } as any,
        ];

        // Generar y subir PDFs
        await this.pdfService.generateAndUploadPdfs(
          documentsParams,
          data.userId,
          newLoan.id
        );

        this.logger.debug('PDFs generados y subidos exitosamente', {
          event: 'pdf_generation_success',
          loanId: newLoan.id,
          userId: data.userId,
          documentsCount: documentsParams.length
        });

      } catch (pdfError) {
        // Registrar el error pero continuar con el proceso
        this.logger.error('Error generando PDFs para solicitud de préstamo', pdfError, {
          event: 'pdf_generation_error',
          loanId: newLoan.id,
          userId: data.userId,
          errorType: 'pdf_generation_failed',
          continueProcess: true
        });
      }

      // Enviar correo al usuario con información del préstamo
      try {
        this.logger.debug('Enviando correo de confirmación', {
          event: 'email_sending_start',
          loanId: newLoan.id,
          email: user.email
        });

        await this.mailService.sendCreateNewLoan({
          mail: newLoan.user?.email as string,
          loanId: newLoan.id,
          reqCantity: newLoan.cantity
        });

        this.logger.debug('Correo de confirmación enviado exitosamente', {
          event: 'email_sent_success',
          loanId: newLoan.id,
          email: user.email
        });

      } catch (emailError) {
        this.logger.error('Error enviando correo de confirmación', emailError, {
          event: 'email_sending_error',
          loanId: newLoan.id,
          email: user.email,
          errorType: 'email_failed'
        });
      }

      const duration = Date.now() - startTime;
      this.logger.debug('Proceso de creación de préstamo completado', {
        event: 'loan_creation_completed',
        loanId: newLoan.id,
        userId: data.userId,
        duration: `${duration}ms`,
        success: true
      });

      return newLoan as unknown as ILoanApplication;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Error en la creación del préstamo', error, {
        event: 'loan_creation_error',
        userId: data.userId,
        duration: `${duration}ms`,
        errorType: error.constructor.name,
        success: false
      });
      throw new BadRequestException(`Error al crear la solicitud de préstamo: ${error.message || 'Error desconocido'}`);
    }
  }

  async preCreate(data: Partial<PreCreateLoanApplicationDto>) {
    const startTime = Date.now();

    try {
      this.logger.debug("Iniciando pre-creación de solicitud de préstamo");

      // Log específico para city y residence_address
      this.logger.debug('🏠 [LOAN_SERVICE] Campos de ubicación recibidos en preCreate:', {
        event: 'location_fields_received',
        userId: data.userId,
        city: {
          original: data.city,
          type: typeof data.city,
          isEmpty: data.city === '',
          isUndefined: data.city === undefined,
          isNull: data.city === null
        },
        residence_address: {
          original: data.residence_address,
          type: typeof data.residence_address,
          isEmpty: data.residence_address === '',
          isUndefined: data.residence_address === undefined,
          isNull: data.residence_address === null
        }
      });

      // Validation of required documents
      if (!data.isValorAgregado && !data.fisrt_flyer && !data.second_flyer && !data.third_flyer) {
        this.logger.warn('Documentos requeridos faltantes en pre-creación', {
          event: 'missing_required_documents',
          userId: data.userId,
          hasLaborCard: !!data.labor_card,
          flyersStatus: {
            first: !!data.fisrt_flyer,
            second: !!data.second_flyer,
            third: !!data.third_flyer
          }
        });

        if (!data.labor_card) throw new BadRequestException("Porfavor sube los volantes de pago y la carta laboral");
        throw new BadRequestException("Porfavor sube los volantes de pago");
      }

      // Generate random IDs for documents
      this.logger.debug('Generando IDs únicos para documentos', {
        event: 'generating_document_ids',
        userId: data.userId
      });

      const {
        upSignatureId,
        upid_first_flyer,
        upid_second_flyer,
        upid_third_flyer,
        upid_labor_card
      } = RandomUpIdsGenerator({
        isSignature: true,
        isLaborCard: data.labor_card !== null,
        isFlyer: data.fisrt_flyer !== null
          && data.second_flyer !== null
          && data.third_flyer !== null,
      });

      this.logger.debug('Subiendo documentos a GCP', {
        event: 'uploading_documents_gcp',
        userId: data.userId,
        documentsToUpload: {
          hasFirstFlyer: !!data.fisrt_flyer,
          hasSecondFlyer: !!data.second_flyer,
          hasThirdFlyer: !!data.third_flyer,
          hasLaborCard: !!data.labor_card
        }
      });

      const {
        fisrt_flyer,
        second_flyer,
        third_flyer,
        labor_card,
      } = await this.gcpService.uploadDocsToLoan({
        userId: data.userId as string,
        fisrt_flyer: data.fisrt_flyer ?? null,
        upid_first_flyer: upid_first_flyer ? upid_first_flyer : null,
        second_flyer: data.second_flyer ? data.second_flyer : null,
        upid_second_flyer: upid_second_flyer ? upid_second_flyer : null,
        third_flyer: data.third_flyer ? data.third_flyer : null,
        upid_third_flyer: upid_third_flyer ? upid_third_flyer : null,
        labor_card: data.labor_card ? data.labor_card : null,
        upid_labor_card: upid_labor_card ? upid_labor_card : null,
      });

      this.logger.debug('Documentos subidos a GCP exitosamente', {
        event: 'documents_uploaded_gcp_success',
        userId: data.userId
      });

      // Upload signature to Cloudinary
      this.logger.debug('Subiendo firma a Cloudinary', {
        event: 'uploading_signature_cloudinary',
        userId: data.userId,
        signatureId: upSignatureId
      });

      const resImage = await this.cloudinary.uploadImage(
        data.signature as string,
        'signatures',
        `signature-${data.userId}-${upSignatureId}`
      );

      // Generate a 6-digit numeric token
      const token = Math.floor(100000 + Math.random() * 900000).toString();

      this.logger.debug('Token de verificación generado', {
        event: 'verification_token_generated',
        userId: data.userId,
        tokenLength: token.length
      });

      // Log específico antes de guardar en base de datos
      this.logger.debug('🏠 [LOAN_SERVICE] Datos a guardar en PreLoanApplication:', {
        event: 'saving_to_database',
        userId: data.userId,
        city: {
          value: data.city,
          type: typeof data.city,
          willBeSaved: data.city
        },
        residence_address: {
          value: data.residence_address,
          type: typeof data.residence_address,
          willBeSaved: data.residence_address
        }
      });

      const preCreatedLoan = await this.prisma.preLoanApplication.create({
        data: {
          userId: data.userId as string,
          phone: data.phone as string,
          entity: data.entity as string,
          bankNumberAccount: data.bankNumberAccount as string,
          cantity: data.cantity as string,
          city: data.city,
          residence_address: data.residence_address,
          terms_and_conditions: data.terms_and_conditions as boolean,
          fisrt_flyer: fisrt_flyer ?? null,
          upid_first_flayer: upid_first_flyer ?? null,
          second_flyer: second_flyer ?? null,
          upid_second_flayer: upid_second_flyer ?? null,
          third_flyer: third_flyer ?? null,
          upid_third_flayer: upid_third_flyer ?? null,
          labor_card: labor_card ?? null,
          upid_labor_card: upid_labor_card ?? null,
          signature: resImage,
          upSignatureId: upSignatureId as string,
          token,
        },
        include: { user: true },
      });

      // Log específico después de guardar en base de datos
      this.logger.debug('🏠 [LOAN_SERVICE] Datos guardados en PreLoanApplication:', {
        event: 'saved_to_database',
        preId: preCreatedLoan.id,
        userId: data.userId,
        city: {
          saved: preCreatedLoan.city,
          type: typeof preCreatedLoan.city
        },
        residence_address: {
          saved: preCreatedLoan.residence_address,
          type: typeof preCreatedLoan.residence_address
        }
      });

      this.logger.warn('Pre-solicitud creada exitosamente', {
        event: 'pre_loan_created_success',
        preId: preCreatedLoan.id,
        userId: data.userId,
        email: preCreatedLoan.user.email
      });

      // send email to user with the token
      try {
        await this.mailService.sendLoanTokenVerification({
          token,
          mail: preCreatedLoan.user.email
        });

        this.logger.warn('Token de verificación enviado por correo', {
          event: 'verification_token_sent',
          preId: preCreatedLoan.id,
          email: preCreatedLoan.user.email
        });

      } catch (emailError) {
        this.logger.error('Error enviando token de verificación', emailError, {
          event: 'verification_token_email_error',
          preId: preCreatedLoan.id,
          email: preCreatedLoan.user.email
        });
      }

      // Prepare the result
      const result = {
        success: true,
        loanId: preCreatedLoan.id,
        createdAt: preCreatedLoan.created_at
      };

      const duration = Date.now() - startTime;
      this.logger.debug('Pre-creación de solicitud completada exitosamente', {
        event: 'pre_loan_creation_completed',
        preId: preCreatedLoan.id,
        userId: data.userId,
        duration: `${duration}ms`,
        success: true
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Error en pre-creación de solicitud de préstamo', error, {
        event: 'pre_loan_creation_error',
        userId: data.userId,
        duration: `${duration}ms`,
        errorType: error.constructor.name,
        success: false
      });
      throw new BadRequestException('Error al pre-crear la solicitud de préstamo');
    }
  }

  async verifyPreLoan(token: string, preId: string): Promise<CreateLoanApplicationDto> {
    const startTime = Date.now();

    try {
      this.logger.debug('Iniciando verificación de pre-solicitud', {
        event: 'pre_loan_verification_start',
        preId,
        tokenProvided: !!token
      });

      // Buscar la solicitud pre-préstamo
      const preLoan = await this.prisma.preLoanApplication.findUnique({
        where: { id: preId },
        include: { user: true },
      });

      if (!preLoan) {
        this.logger.warn('Pre-solicitud no encontrada', {
          event: 'pre_loan_not_found',
          preId,
          token
        });
        throw new NotFoundException('Solicitud de préstamo no encontrada');
      }

      this.logger.debug('Pre-solicitud encontrada', {
        event: 'pre_loan_found',
        preId,
        userId: preLoan.userId,
        createdAt: preLoan.created_at,
        processed: preLoan.processed || false
      });

      // Verificar si el token es válido
      if (preLoan.token !== token) {
        this.logger.warn('Token inválido proporcionado', {
          event: 'invalid_token',
          preId,
          userId: preLoan.userId,
          tokenMatch: false
        });
        throw new BadRequestException('Token inválido o ha expirado');
      }

      this.logger.debug('Token válido confirmado', {
        event: 'token_valid',
        preId,
        userId: preLoan.userId
      });

      // Verificar si ya existe un préstamo creado a partir de este pre-préstamo
      const existingLoan = await this.prisma.loanApplication.findFirst({
        where: {
          userId: preLoan.userId,
          entity: preLoan.entity,
          bankNumberAccount: preLoan.bankNumberAccount,
          upSignatureId: preLoan.upSignatureId,
          created_at: {
            gte: preLoan.created_at
          }
        }
      });

      if (existingLoan) {
        this.logger.warn('Intento de crear préstamo duplicado detectado', {
          event: 'duplicate_loan_attempt',
          preId,
          userId: preLoan.userId,
          existingLoanId: existingLoan.id,
          upSignatureId: preLoan.upSignatureId
        });
        throw new BadRequestException('Esta solicitud de préstamo ya ha sido procesada anteriormente');
      }

      // Preparar los datos para crear el préstamo
      const bodyReqLoan: CreateLoanApplicationDto = {
        userId: preLoan.userId,
        phone: preLoan.phone!,
        entity: preLoan.entity,
        bankNumberAccount: preLoan.bankNumberAccount,
        cantity: preLoan.cantity,
        city: preLoan.city ?? undefined,
        residence_address: preLoan.residence_address ?? undefined,
        terms_and_conditions: preLoan.terms_and_conditions,
        fisrt_flyer: preLoan.fisrt_flyer,
        upid_first_flayer: preLoan.upid_first_flayer,
        second_flyer: preLoan.second_flyer,
        upid_second_flyer: preLoan.upid_second_flayer,
        third_flyer: preLoan.third_flyer,
        upid_third_flayer: preLoan.upid_third_flayer,
        labor_card: preLoan.labor_card,
        upid_labor_card: preLoan.upid_labor_card,
        signature: preLoan.signature,
        upSignatureId: preLoan.upSignatureId,
      }

      this.logger.debug('Iniciando creación de préstamo desde pre-solicitud', {
        event: 'creating_loan_from_pre',
        preId,
        userId: preLoan.userId
      });

      // Crear el nuevo préstamo
      const newLoan = await this.create(bodyReqLoan);

      if (!newLoan) {
        this.logger.error('Fallo en creación de préstamo desde pre-solicitud', null, {
          event: 'loan_creation_from_pre_failed',
          preId,
          userId: preLoan.userId
        });
        throw new BadRequestException('Error al crear la solicitud de préstamo');
      }

      // Marcar el pre-préstamo como utilizado
      await this.prisma.preLoanApplication.update({
        where: { id: preId },
        data: {
          processed: true,
          processedAt: new Date(),
          loanApplicationId: newLoan.id
        },
      });

      const duration = Date.now() - startTime;
      this.logger.debug('Verificación y creación de préstamo completada exitosamente', {
        event: 'pre_loan_verification_completed',
        preId,
        loanId: newLoan.id,
        userId: preLoan.userId,
        duration: `${duration}ms`,
        success: true
      });

      // Return the data that was used to create the loan
      return bodyReqLoan;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Error verificando pre-solicitud', error, {
        event: 'pre_loan_verification_error',
        preId,
        duration: `${duration}ms`,
        errorType: error.constructor.name,
        success: false
      });
      throw new BadRequestException(`Error al verificar la solicitud de préstamo: ${error.message || 'Error desconocido'}`);
    }
  }
}