import { Injectable, Logger } from '@nestjs/common';
import { GoogleCloudService } from 'src/gcp/gcp.service';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import { DocumentGenerationParams, PromissoryNoteData, PromissoryNoteGenerationParams, TextOptions } from './dto/create-pdf.dto';

@Injectable()
export class PdfsService {
  private readonly logger = new Logger(PdfsService.name);

  constructor(private readonly googleCloudService: GoogleCloudService) {}

  /**
   * Adds text to the PDF document with the provided options
   */
  private addText(
    doc: jsPDF,
    text: string,
    x: number,
    y: number,
    options?: TextOptions,
  ) {
    doc.text(text, x, y, options);
  }

  /**
   * Loads an image from a Base64 string or URL
   */
  private async loadImage(src: string): Promise<Buffer> {
    if (src.startsWith('data:image')) {
      // Handle Base64 image
      const base64Data = src.split(',')[1];
      return Buffer.from(base64Data, 'base64');
    } else {
      // Handle URL image
      const response = await fetch(src);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  }

  /**
   * Adds a signature image to the PDF
   */
  private addSignature(
    doc: jsPDF,
    imgBuffer: Buffer,
    x: number,
    y: number,
    label: string,
  ) {
    // Convert Buffer to base64 string
    const base64Img = imgBuffer.toString('base64');
    
    // Calculate dimensions
    const imgWidth = 50;
    // For simplicity, assume height is proportional (1:1)
    const imgHeight = 20;

    doc.addImage(`data:image/png;base64,${base64Img}`, 'PNG', x, y, imgWidth, imgHeight);
    const lineY = y + imgHeight + 2;
    doc.line(x, lineY, x + imgWidth, lineY);
    this.addText(doc, label, x, lineY + 6);
  }

  /**
   * Generates a regular PDF document based on the provided data
   */
  private async generatePdf({
    documentData,
    numberDocument,
    entity,
    numberBank,
    signature,
  }: DocumentGenerationParams): Promise<Buffer> {
    const doc = new jsPDF();
    
    // Update account data
    const jsonData = {
      ...documentData,
      optionAccount: {
        entityAccount: entity,
        numberAccount: numberBank,
      },
    };

    doc.setFontSize(10);
    let y = 15;

    this.addText(
      doc,
      `${jsonData.TitlePrevExplain}${jsonData.prevExplain}`,
      10,
      y,
      { maxWidth: 190 },
    );
    y += 90;

    this.addText(
      doc,
      `${jsonData.headerTitle} ${jsonData.firstExplainText} `,
      10,
      y,
      { maxWidth: 190 },
    );
    y += 167;

    this.addText(doc, jsonData.secondTitle, 10, y, { maxWidth: 190 });
    y += 10;

    doc.setFontSize(13);
    this.addText(
      doc,
      `Cuenta Ahorros Nro. Cuenta ${jsonData.optionAccount.numberAccount} Entidad: ${jsonData.optionAccount.entityAccount}`,
      10,
      y,
      { maxWidth: 190 },
    );
    y += -265;

    doc.setFontSize(10);
    doc.addPage();

    this.addText(doc, jsonData.threeTitle, 10, y, { maxWidth: 190 });
    y += 5;

    this.addText(doc, jsonData.justifyText, 10, y, { maxWidth: 190 });
    y += 15;

    this.addText(doc, jsonData.numberOnce + jsonData.textOnce, 10, y, {
      maxWidth: 190,
    });
    y += 25;

    this.addText(doc, jsonData.finalTitle, 10, y, { maxWidth: 190 });
    y += 6;

    this.addText(doc, jsonData.subFinalText, 10, y, { maxWidth: 190 });
    y += 65;

    this.addText(doc, jsonData.finalText, 10, y, { maxWidth: 190 });
    y += 10;

    if (signature) {
      try {
        const imgBuffer = await this.loadImage(signature);
        this.addSignature(doc, imgBuffer, 10, y, "Firma del solicitante");

        const docX = 70;
        const docY = y + 20; // Estimated height adjustment
        this.addText(doc, numberDocument, docX, docY);
        doc.line(docX, docY + 2, docX + 40, docY + 2);
        this.addText(doc, "C.C.", docX, docY + 6);
      } catch (error) {
        this.logger.error("Error loading signature image", error);
      }
    }

    // Return PDF buffer
    return Buffer.from(doc.output('arraybuffer'));
  }

  /**
   * Generates a promissory note PDF
   */
  private async generatePromissoryNotePdf({
    name,
    numberDocument,
    signature,
    payDay,
    payQuantity,
    dayPay,
    logoUrl = 'https://res.cloudinary.com/dvquomppa/image/upload/v1717654334/credito_ya/cirm9vbdngqyxymcpfad.png',
  }: PromissoryNoteGenerationParams): Promise<Buffer> {
    const doc = new jsPDF();
    let y = 8;

    // Define default promissory note data structure
    const promissoryNoteData: PromissoryNoteData = {
      logoHeader: logoUrl,
      numero_pagare: {
        publicText: "No.",
        publicId: "",
      },
      fecha_vencimiento: {
        publicText: "Fecha de Vencimiento: ",
        date: payDay || "",
      },
      firstParagraph: {
        namePerson: name,
        publicfirstText: "mayor de edad, identificado con la cedula de ciudadania numero",
        numberDocument: numberDocument,
        publicSecondText: "quien obra en nombre propio, me obligo(gamos) a pagar solidaria e incondicionalmente a la orden de CREDITOYA SAS, en dinero efectivo, en cualquiera de sus oficinas a nivel nacional el dia ",
        payDay: payDay || "_________________",
        publicFiveText: ", la suma de ",
        payQuantity: payQuantity || "_________________",
      },
      secondParagraph: "En caso de mora y mientras ella subsista, pagare (pagaremos) interese moratorios a la tasa máxima legal, sin perjuicio del derecho del acreedor en tal evento vencido el plazo de la obligación y exigible de una vez y en su totalidad el capital, los intereses moratorios y demás cargos a que haya lugar, siendo de nuestra responsabilidad el pago del impuesto y demás sumas que se causen con la emisión de este pagaré; de igual manera, por medio del presente documento apoderamos y autorizamos de manera especial, expresa e irrevocable a CREDITOYA SAS, para que en nuestro nombre y representación contrate la gestión de cobranza que se haga necesaria en el evento de mora en el cumplimiento de nuestras obligaciones, y por lo mismo, me (nos) obligo (obligamos) a pagar todos los gastos y costos de la cobranza judicial y extrajudicial, incluidos los honorarios de abogado, que pagare (pagaremos) conjuntamente con la liquidación del crédito. Autorizo (autorizamos) a CREDITOYA SAS para que el vencimiento de este pagare, debite de cualquier cuenta a mi (nuestro) favor, el valor de esta obligación, sus intereses, penalidades y gastos, el recibo de abonos parciales no implica novación y cualquier pago que hiciere (hiciéremos) se imputara primero a los gatos, después a intereses y penalidades y por último a capital, declaro (declaramos) excusada la presentación y la noticia de rechazo, los suscriptores de este pagare, hacen constar que la obligación de pagarlo subsiste en caso de cualquier modificación a lo estipulado, aunque se pacte con uno solo de los suscriptores, acepto (amos) que el pago, constarán en los registros sistematizados y comprobantes de CREDITOYA SAS.",
      threeParagraph: "El plazo establecido para la cancelación de las obligaciones incorporadas en el presente pagare, se concede en beneficio de ambas partes en tal virtud, CREDITOYA SAS no esta obligada a aceptar su pago del vencimiento acordado; sin embargo, en el evento en que se acepte el pago anticipado me (nos) obligo (obligamos) a reconocer y pagar a favor de CREDITOYA SAS, a titulo cláusula penal por incumplimiento la suma calculada a partir de las condiciones vigentes en la entidad sobre penalización de prepagos.",
      fourParagraph: "En caso de muerte de los deudores, el acreedor queda con el derecho a exigir la totalidad del crédito a uno o cualquiera de los herederos, sin necesidad de demandarlos a todos. Así mismo, el acreedor podrá declarar vencido el plazo y exigible de una vez el pago total de la obligación, más lo intereses remunerados, la mora, los conceptos adicionales por seguros y demás accesorios, en los siguientes casos: a) mora o retardo en el pago de uno o más de los vencimientos de capital o intereses señalados o por concepto de prima de seguros respecto al deudor (deudores) y bienes dados en garantías; b) el incumplimiento de cualquiera otra obligación que directa o indirectamente tenga el deudor (deudores) para con el acreedor; c) si los bienes del deudor (deudores) son embargados o perseguidos judicial o administrativamente en ejercicio de cualquier acción; d) el giro de cheques sin provisión de fondos o el no pago de los mismos por partes del deudor, codeudores o avalistas; e) si el deudor (deudores), codeudores o avalistas fuere (n) admitido (s) a proceso concursal por concordato o liquidación forzosa, o incurra (n) en causal de disolución, o sea (n) sometido a liquidación forzosa, administrativa o hagan ofrecimiento de cesión de bienes a sus acreedores, f) si las garantías que se otorguen para amparar las obligaciones a cargo del (los) deudor (deudores) y a favor del acreedor, resultaren insuficientes o se depreciaren o deterioraren a juicio del acreedor o si fueran perseguidas judicialmente por terceros, para esto bastará simplemente la declaración escrita de CREDITOYA SAS en comunicación dirigida al deudor por carta o telegrama; comunicación que éste acepta como prueba suficiente y plena de incumplimiento; g) cuando el deudor enajene sin autorización de CREDITOYA SAS los bienes que garantizan las obligaciones; h) si los deudores dejaren de mantener asegurados los bienes que sirven de garantía a las obligaciones; i) si los deudores enajenaren sin autorización del acreedor los bienes que garantizan las obligaciones que por este pagaré se contraen; j) la entrega de títulos valores aceptados por el deudor y distintos al presente, respecto de los cuales se incumpla con el pago.",
      fiveParagraph: {
        publicFirstText: "La mera amplicacion del plazo no constituye novacion ni libera las garantias constituidas a favor de CREDITOYA SAS.",
        publicSecondText: "Para constancia se firma en Cali, el dia ",
        dayPay: dayPay || "_________________",
      },
      signature: signature || "",
      numberDocument: numberDocument,
    };

    try {
      // Load logo and signature images
      const logoBuffer = await this.loadImage(promissoryNoteData.logoHeader);
      let signatureBuffer: Buffer | null = null;
      
      if (signature) {
        signatureBuffer = await this.loadImage(signature);
      }
      
      // Add logo to the PDF
      const imgWidth = 70;
      const logoHeight = 25; // Approximate height
      doc.addImage(
        logoBuffer.toString('base64'), 
        'PNG', 
        10, 
        y, 
        imgWidth, 
        logoHeight
      );
      y += 28;
      
      // Add text to the PDF
      doc.setFontSize(10);
      this.addText(
        doc,
        promissoryNoteData.numero_pagare.publicText + ` _________________`,
        10,
        y
      );
      y += 10;
      
      this.addText(
        doc,
        promissoryNoteData.fecha_vencimiento.publicText + ` _________________`,
        10,
        y
      );
      y += 10;
      
      const firstParagraph = `${promissoryNoteData.firstParagraph.namePerson} ${promissoryNoteData.firstParagraph.publicfirstText} ${promissoryNoteData.firstParagraph.numberDocument} ${promissoryNoteData.firstParagraph.publicSecondText} ${promissoryNoteData.firstParagraph.payDay} ${promissoryNoteData.firstParagraph.publicFiveText} ${promissoryNoteData.firstParagraph.payQuantity}`;
      this.addText(doc, firstParagraph, 10, y, { maxWidth: 190 });
      y += 15;
      
      this.addText(doc, promissoryNoteData.secondParagraph, 10, y, { maxWidth: 180 });
      y += 68;
      
      this.addText(doc, promissoryNoteData.threeParagraph, 10, y, { maxWidth: 180 });
      y += 25;
      
      this.addText(doc, promissoryNoteData.fourParagraph, 10, y, { maxWidth: 180 });
      y += 85;
      
      const fiveParagraph = `${promissoryNoteData.fiveParagraph.publicFirstText} ${promissoryNoteData.fiveParagraph.publicSecondText} ${promissoryNoteData.fiveParagraph.dayPay}`;
      this.addText(doc, fiveParagraph, 10, y, { maxWidth: 190 });
      y += 10;
      
      // Add signature to the PDF if available
      if (signatureBuffer) {
        const sigWidth = 50;
        const sigHeight = 20; // Approximate height
        
        doc.addImage(
          signatureBuffer.toString('base64'),
          'PNG',
          10,
          y,
          sigWidth,
          sigHeight
        );
        
        // Line and text below the signature
        const lineY = y + sigHeight + 2;
        doc.line(10, lineY, 10 + sigWidth, lineY);
        this.addText(doc, "Firma del solicitante", 10, lineY + 6);
        
        // Add document number next to the signature
        const docX = 70;
        const docY = y + sigHeight / 1;
        this.addText(doc, `${promissoryNoteData.numberDocument}`, docX, docY);
        doc.line(docX, docY + 2, docX + 40, docY + 2);
        this.addText(doc, "C.C.", docX, docY + 6);
      }
      
      // Return PDF buffer
      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      this.logger.error("Error generating promissory note PDF", error);
      throw error;
    }
  }

  /**
   * Generates a blank promissory note instructions PDF
   */
  private async generateBlankPromissoryInstructionsPdf({
    name,
    numberDocument,
    signature,
  }: PromissoryNoteGenerationParams): Promise<Buffer> {
    const doc = new jsPDF();
    let y = 10;
    
    doc.setFontSize(12);
    this.addText(doc, "5. CARTA DE INSTRUCCIONES DE PAGARÉ EN BLANCO", 10, y, { maxWidth: 190 });
    y += 10;
    
    doc.setFontSize(10);
    const firstParagraph = `${name}, mayor de edad, identificado con la cédula de ciudadanía número ${numberDocument}`;
    this.addText(doc, firstParagraph, 10, y, { maxWidth: 190 });
    y += 15;
    
    const secondParagraph = "quien obra en nombre propio, por medio de la presente comunicación y de conformidad con lo establecido en el artículo 622 del Código de Comercio, autorizamos expresa e irrevocablemente a CREDITOYA SAS, a llenar los espacios en blanco del Pagaré a la Orden que hemos otorgado en su favor y que se adjunta a la presente carta de instrucciones, el cual corresponde a todas las operaciones que consta y lleguen a constar en los documentos soporte y/o en los registros sistematizados y comprobantes de CREDITOYA SAS, a nuestro cargo, por cualquier concepto. El titulo valor será llenado por Ustedes sin previo aviso, en el evento de presentarse mora en el cumplimiento de cualquiera de mi (nuestras) obligación (es) para con CREDITOYA SAS y de acuerdo con las siguientes instrucciones.";
    this.addText(doc, secondParagraph, 10, y, { maxWidth: 190 });
    y += 35;
    
    const instructions = [
      "1. Los espacios correspondientes al día, mes y año del pago corresponden a la fecha en que CREDITOYA SAS complete el instrumento por considerarlo necesario para su cobro, la cual corresponderá así mismo a la Fecha de Vencimiento.",
      "2. La cuantía del título será llenado conforme al monto total o parcial de todas las obligaciones exigibles que a mi (nuestro) cargo y a favor de CREDITOYA SAS existan al momento de ser llenado el título, incluidos pero no limitados al valor del capital adeudado; intereses remuneratorios, intereses de mora, si a ello hubiere lugar, liquidado a la tasa máxima legal permitida; los costos legales para el cobro del instrumento; el costo del seguro de vida de deudores e inclusive los que correspondan a la garantía que otorgue el Fondo Nacional de Garantías, el Fondo Regional de Garantías o cualquier otro de caracteristicas similares, si los hubiere. La anterior descripción es meramente enunciativa y no taxativa.",
      "3. El impuesto de timbre a que haya lugar cuando el título sea llenado, correrá por cuenta mía (nuestra) y si CREDITOYA SAS lo cancela, su monto puede ser cobrado a mi (nosotros) junto con las demás obligaciones, incorporando la suma pagada dentro del pagaré respectivo.",
      "4. Los espacios en blanco se llenarán cuando exista un incumplimiento parcial o total cualquiera de las obligaciones adquiridas a cualquier titulo para con CREDITOYA SAS o cuando se presenten algunas de las causales de aceleración del plazo establecidas en el título.",
      "5. Se adjunta al presente documento el pagaré en blanco antes enunciado, el cual declara haber recibido CREDITOYA SAS comprometiéndose a custodiarlo y a utilizarlo conforme a la aquí dispuesto."
    ];
    
    for (const instruction of instructions) {
      this.addText(doc, instruction, 10, y, { maxWidth: 190 });
      y += 15;
    }
    
    y += 10;
    const finalText = "Hago (hacemos) constar que en mi (nuestro) poder queda copia de la presente carta, la que reúne todas la instrucciones que considero (amos) necesarias impartir para el diligenciamiento del pagaré en mención.";
    this.addText(doc, finalText, 10, y, { maxWidth: 190 });
    y += 20;
    
    // Add signature if available
    if (signature) {
      try {
        const imgBuffer = await this.loadImage(signature);
        this.addSignature(doc, imgBuffer, 10, y, "Firma del solicitante");
        
        const docX = 70;
        const docY = y + 20;
        this.addText(doc, numberDocument, docX, docY);
        doc.line(docX, docY + 2, docX + 40, docY + 2);
        this.addText(doc, "C.C.", docX, docY + 6);
      } catch (error) {
        this.logger.error("Error loading signature image", error);
      }
    }
    
    return Buffer.from(doc.output('arraybuffer'));
  }

  /**
   * Generates multiple PDFs and packages them into a ZIP file
   */
  async generateMultiplePdfs(
    documentsParams: Array<DocumentGenerationParams | PromissoryNoteGenerationParams>,
  ): Promise<Buffer> {
    try {
      const zip = new JSZip();
      
      // Generate each PDF and add to ZIP
      for (const docParams of documentsParams) {
        let pdfBuffer: Buffer;
        let fileName: string;
        
        // Check if it's a promissory note generation
        if ('name' in docParams) {
          // It's a promissory note
          if (docParams.documentType === 'promissory-note') {
            pdfBuffer = await this.generatePromissoryNotePdf(docParams as PromissoryNoteGenerationParams);
            fileName = `pagare_${docParams.numberDocument}.pdf`;
          } else if (docParams.documentType === 'blank-instructions') {
            pdfBuffer = await this.generateBlankPromissoryInstructionsPdf(docParams as PromissoryNoteGenerationParams);
            fileName = `instrucciones_pagare_${docParams.numberDocument}.pdf`;
          } else {
            throw new Error(`Unknown document type: ${docParams.documentType}`);
          }
        } else {
          // It's a regular document
          pdfBuffer = await this.generatePdf(docParams as DocumentGenerationParams);
          fileName = `${docParams.documentType}_${docParams.numberDocument}.pdf`;
        }
        
        zip.file(fileName, pdfBuffer);
      }
      
      // Generate ZIP file
      return await zip.generateAsync({ type: 'nodebuffer' });
    } catch (error) {
      this.logger.error('Error generating multiple PDFs', error);
      throw error;
    }
  }

  /**
   * Generates and uploads multiple PDFs as a ZIP file to Google Cloud Storage
   */
  async generateAndUploadPdfs(
    documentsParams: Array<DocumentGenerationParams | PromissoryNoteGenerationParams>,
    userId: string,
  ): Promise<{ success: boolean; public_name?: string }> {
    try {
      // Generate ZIP with PDFs
      const zipBuffer = await this.generateMultiplePdfs(documentsParams);
      
      // Create a File object from the ZIP buffer
      const blob = new Blob([zipBuffer], { type: 'application/zip' });
      const file = new File([blob], 'documents.zip', { type: 'application/zip' });
      
      // Upload to Google Cloud Storage
      const uploadId = uuidv4();
      const result = await this.googleCloudService.uploadToGcs({
        file,
        userId,
        name: 'documents',
        upId: uploadId,
      });
      
      return result;
    } catch (error) {
      this.logger.error('Error generating and uploading PDFs', error);
      throw error;
    }
  }
}