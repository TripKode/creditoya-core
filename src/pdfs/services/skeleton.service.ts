import { Inject, Injectable, Logger } from "@nestjs/common";

import {
    SKELETON_JSON_00,
    SKELETON_JSON_01,
    SKELETON_JSON_02,
    SKELETON_JSON_03,
    SKELETON_SUB_JSON_02
} from "templates/AboutPdf";

import {
    SkeletonJson00Type,
    SkeletonJson01Type,
    SkeletonJson02Type,
    SkeletonJson03Type,
    SkeletonSubJson02Type
} from "../dto/create-pdf.dto";

import { jsPDF } from "jspdf";
import { HelpersPDFService } from "./helpers.service";
import { BankTypes, handleKeyToString } from "handlers/bank-to-string";

@Injectable()
export class SkeletonPdfServices {
    private readonly logger = new Logger(SkeletonPdfServices.name);

    constructor(
        @Inject(SKELETON_JSON_00)
        private readonly Skeleton00: SkeletonJson00Type,
        @Inject(SKELETON_JSON_01)
        private readonly Skeleton01: SkeletonJson01Type,
        @Inject(SKELETON_JSON_02)
        private readonly Skeleton02: SkeletonJson02Type,
        @Inject(SKELETON_SUB_JSON_02)
        private readonly SkeletonSub02: SkeletonSubJson02Type,
        @Inject(SKELETON_JSON_03)
        private readonly Skeleton03: SkeletonJson03Type,
        private helpers: HelpersPDFService,
    ) { }

    /**
     * Generates an "About Loan" PDF document
     * @param params The parameters for generating the PDF
     * @returns Buffer containing the generated PDF
     */
    public async generateAboutLoanPdf(params: {
        signature: string;
        numberDocument: string;
        entity: string,
        accountNumber: string,
        autoDownload?: boolean;
    }): Promise<Buffer> {
        const { signature, numberDocument, entity, accountNumber } = params;
        const jsonData = this.Skeleton00;
        const doc = new jsPDF();
        doc.setFontSize(10);
        let y = 15;

        // First page content
        this.helpers.addText(
            doc,
            `${jsonData.TitlePrevExplain}${jsonData.prevExplain}`,
            10,
            y,
            { maxWidth: 190 }
        );
        y += 90;

        this.helpers.addText(
            doc,
            `${jsonData.headerTitle} ${jsonData.firstExplainText}`,
            10,
            y,
            { maxWidth: 190 }
        );
        y += 167;

        this.helpers.addText(doc, jsonData.secondTitle, 10, y, { maxWidth: 190 });
        y += 10;

        doc.setFontSize(13);
        this.helpers.addText(
            doc,
            `Cuenta Ahorros Nro. Cuenta ${accountNumber} Entidad: ${handleKeyToString(entity as BankTypes)}`,
            10,
            y,
            { maxWidth: 190 }
        );

        // Second page content
        doc.addPage();
        doc.setFontSize(10);
        y = 15; // Reset y position for the new page

        this.helpers.addText(doc, jsonData.threeTitle, 10, y, { maxWidth: 190 });
        y += 5;

        this.helpers.addText(doc, jsonData.justifyText, 10, y, { maxWidth: 190 });
        y += 15;

        this.helpers.addText(doc, jsonData.numberOnce + jsonData.textOnce, 10, y, {
            maxWidth: 190,
        });
        y += 25;

        this.helpers.addText(doc, jsonData.finalTitle, 10, y, { maxWidth: 190 });
        y += 6;

        this.helpers.addText(doc, jsonData.subFinalText, 10, y, { maxWidth: 190 });
        y += 65;

        this.helpers.addText(doc, jsonData.finalText, 10, y, { maxWidth: 190 });
        y += 10;

        // Add signature if provided
        if (signature) {
            try {
                const img = await this.helpers.loadImage(signature);
                this.helpers.addSignature(doc, img, 10, y, "Firma del solicitante");

                const docX = 70;
                const docY = y + 22; // Standard offset instead of the complex calculation
                this.helpers.addText(doc, numberDocument, docX, docY);
                doc.line(docX, docY + 2, docX + 40, docY + 2);
                this.helpers.addText(doc, "C.C.", docX, docY + 6);
            } catch (error) {
                this.logger.error("Error loading signature image", error);
                throw error;
            }
        }

        // Return the PDF as a buffer
        return Buffer.from(doc.output('arraybuffer'));
    }

    /**
     * Generates a PDF document for an instruction letter with signature
     * @param params The parameters for generating the PDF
     * @returns Buffer containing the generated PDF
     */
    async generateInstructionLetterPdf(params: {
        signature: string;
        numberDocument: string;
        name: string;
    }): Promise<Buffer> {
        const { signature, numberDocument, name } = params;
        const jsonData = this.Skeleton01;
        const doc = new jsPDF();

        // Helper function to add a signature and document info
        const addSignatureAndDocument = async (
            yPosition: number,
            signature: string,
            name: string,
            numberDocument: string
        ) => {
            try {
                const img = await this.helpers.loadImage(signature);
                const imgWidth = 50;
                const imgHeight = 20;

                // Convert Buffer to base64 string
                const base64Img = img.toString('base64');

                // Add signature image
                doc.addImage(`data:image/png;base64,${base64Img}`, 'PNG', 10, yPosition, imgWidth, imgHeight);

                // Add line under signature
                const lineY = yPosition + imgHeight + 2;
                doc.line(10, lineY, 10 + imgWidth, lineY);

                // Add text labels
                this.helpers.addText(doc, "Firma del solicitante", 10, lineY + 6);
                this.helpers.addText(doc, "Nombre: " + name, 10, lineY + 11);
                this.helpers.addText(doc, "Identificación: " + numberDocument, 10, lineY + 16);
            } catch (error) {
                this.logger.error("Error adding signature to PDF", error);
                throw error;
            }
        };

        // Begin creating PDF
        doc.setFontSize(10);
        let y = 15; // Initial Y position

        // First page
        this.helpers.addText(doc, jsonData.firstParagraph, 10, y, { maxWidth: 190 });
        y += 95;

        this.helpers.addText(
            doc,
            jsonData.firstText +
            `__________________________________________,` +
            jsonData.secondText +
            `______________________, ` +
            jsonData.secondParagraph,
            10,
            y,
            { maxWidth: 190 }
        );
        y += 40;

        this.helpers.addText(doc, jsonData.inst01, 20, y, { maxWidth: 180 });
        y += 15;

        this.helpers.addText(doc, jsonData.inst02, 20, y, { maxWidth: 180 });
        y += 30;

        this.helpers.addText(doc, jsonData.inst03, 20, y, { maxWidth: 180 });
        y += 15;

        this.helpers.addText(doc, jsonData.inst04, 20, y, { maxWidth: 180 });
        y += 15;

        this.helpers.addText(doc, jsonData.inst05, 20, y, { maxWidth: 180 });
        y += 15;

        this.helpers.addText(doc, jsonData.finalSecondParagraph, 10, y, { maxWidth: 180 });
        y += 10;

        // Add signature to first page
        await addSignatureAndDocument(y, signature, name, numberDocument);

        // Second page
        doc.addPage();
        y = 15; // Reset Y position for second page

        this.helpers.addText(doc, jsonData.threeParagraph, 10, y, { maxWidth: 190 });
        y += 35;

        this.helpers.addText(doc, jsonData.fourParagraph, 10, y, { maxWidth: 190 });
        y += 15;

        // Add signature to second page
        await addSignatureAndDocument(y, signature, name, numberDocument);

        // Return PDF as buffer
        return Buffer.from(doc.output('arraybuffer'));
    }

    /**
     * Generates a PDF document for salary payment authorization with signature
     * @param params The parameters for generating the PDF
     * @returns Buffer containing the generated PDF
     */
    async generateSalaryPaymentAuthorizationPdf(params: {
        signature: string;
        numberDocument: string;
        name: string;
    }): Promise<Buffer> {
        const { signature, numberDocument, name } = params;
        const skeletonPdf = this.Skeleton02
        const sub_skeletonPdf = this.SkeletonSub02;
        const doc = new jsPDF();

        /**
         * Adds signature and document details to the PDF
         */
        const addSignatureAndDocument = async (yPosition: number, signature: string) => {
            try {
                const img = await this.helpers.loadImage(signature);

                // Convert Buffer to base64 string
                const base64Img = img.toString('base64');

                const imgWidth = 50;
                const imgHeight = 20;

                // Add signature image
                doc.addImage(`data:image/png;base64,${base64Img}`, 'PNG', 10, yPosition, imgWidth, imgHeight);

                // Add line under signature
                const lineY = yPosition + imgHeight + 2;
                doc.line(10, lineY, 10 + imgWidth, lineY);

                // Add signature label
                this.helpers.addText(doc, "Firma del solicitante", 10, lineY + 6);

                // Add document number
                const docX = 70;
                const docY = yPosition + imgHeight / 1;
                this.helpers.addText(doc, numberDocument, docX, docY);
                doc.line(docX, docY + 2, docX + 40, docY + 2);
                this.helpers.addText(doc, "C.C.", docX, docY + 6);
            } catch (error) {
                this.logger.error("Error adding signature to PDF", error);
                throw error;
            }
        };

        // Begin creating PDF
        doc.setFontSize(10);

        // First page - Salary Payment Authorization
        let y = 8;
        this.helpers.addText(doc, skeletonPdf.title, 10, y, { maxWidth: 190 });
        y += 8;

        this.helpers.addText(doc, skeletonPdf.firstParagraph + " ______________________", 10, y, {
            maxWidth: 190,
        });
        y += 5;

        this.helpers.addText(doc, skeletonPdf.subFirstParagraph, 10, y, {
            maxWidth: 190,
        });
        y += 50;

        this.helpers.addText(doc, skeletonPdf.secondParagraph, 10, y, { maxWidth: 190 });
        y += 30;

        this.helpers.addText(doc, skeletonPdf.thirdParagraph, 10, y, { maxWidth: 190 });
        y += 49;

        this.helpers.addText(
            doc,
            skeletonPdf.footer +
            " _________________ a los ___________ dias del mes de ___________ de _____________.",
            10,
            y,
            { maxWidth: 190 }
        );
        y += 20;

        // Add signature to first page
        await addSignatureAndDocument(y, signature);

        // Second page - Supplemental document
        doc.addPage();
        let y2 = 8;

        this.helpers.addText(doc, sub_skeletonPdf.title, 10, y2, { maxWidth: 190 });
        y2 += 10;

        this.helpers.addText(
            doc,
            sub_skeletonPdf.firstParagraph + " ______________________",
            10,
            y2,
            { maxWidth: 190 }
        );
        y2 += 4;

        this.helpers.addText(
            doc,
            sub_skeletonPdf.subFirstParagraph +
            " $ ____________________LETRAS (___________________) " +
            sub_skeletonPdf.TwoSubFirstParagraph +
            "____" +
            sub_skeletonPdf.ThreeSubFirstParagraph +
            " $____________________LETRAS(____________________________________) " +
            sub_skeletonPdf.FourSubFirstParagraph +
            "______" +
            sub_skeletonPdf.FiveSubFirstParagraph,
            10,
            y2,
            { maxWidth: 190 }
        );
        y2 += 53;

        this.helpers.addText(doc, sub_skeletonPdf.secondParagraph, 10, y2, { maxWidth: 190 });
        y2 += 30;

        this.helpers.addText(doc, sub_skeletonPdf.thirdParagraph, 10, y2, { maxWidth: 190 });
        y2 += 53;

        this.helpers.addText(
            doc,
            sub_skeletonPdf.footer +
            " ________________ a los _____________________ dias del mes de ______________________ de ____________",
            10,
            y2,
            { maxWidth: 190 }
        );
        y2 += 20;

        // Add signature to second page
        await addSignatureAndDocument(y2, signature);

        // Return PDF as buffer
        return Buffer.from(doc.output('arraybuffer'));
    }

    /**
     * Generates a PDF document for a promissory note with logo and signature
     * @param params The parameters for generating the PDF
     * @returns Buffer containing the generated PDF
     */
    async generatePromissoryNotePdf(params: {
        signature: string;
        numberDocument: string;
        name: string;
    }): Promise<Buffer> {
        const { signature, numberDocument, name } = params;
        const skeletonPdf = this.Skeleton03;
        const doc = new jsPDF();

        try {
            // Update JSON data with provided information
            const jsonData = { ...skeletonPdf };
            jsonData.firstParagraph.namePerson = name;
            jsonData.firstParagraph.numberDocument = numberDocument;

            // Starting position
            let y = 8;

            // Add logo if available
            if (jsonData.logoHeader) {
                const logoBuffer = await this.helpers.loadImage(jsonData.logoHeader);
                const base64Logo = logoBuffer.toString('base64');

                const imgWidth = 70;
                const imgHeight = 20; // Fixed height for consistent positioning

                doc.addImage(`data:image/png;base64,${base64Logo}`, 'PNG', 10, y, imgWidth, imgHeight);
                y += 28;
            }

            // Add text content
            doc.setFontSize(10);

            // Promissory note number and due date
            this.helpers.addText(doc, jsonData.numero_pagare.publicText + " _________________", 10, y);
            y += 10;

            this.helpers.addText(doc, jsonData.fecha_vencimiento.publicText + " _________________", 10, y);
            y += 10;

            // First paragraph with debtor information
            const firstParagraph = `${name} ${jsonData.firstParagraph.publicfirstText} ${numberDocument} ${jsonData.firstParagraph.publicSecondText} _________________ ${jsonData.firstParagraph.publicFiveText} _________________`;
            this.helpers.addText(doc, firstParagraph, 10, y, { maxWidth: 190 });
            y += 15;

            // Terms and conditions paragraphs
            this.helpers.addText(doc, jsonData.secondParagraph, 10, y, { maxWidth: 180 });
            y += 68;

            this.helpers.addText(doc, jsonData.threeParagraph, 10, y, { maxWidth: 180 });
            y += 25;

            this.helpers.addText(doc, jsonData.fourParagraph, 10, y, { maxWidth: 180 });
            y += 85;

            // Final paragraph with date
            const fiveParagraph = `${jsonData.fiveParagraph.publicFirstText} ${jsonData.fiveParagraph.publicSecondText} _________________`;
            this.helpers.addText(doc, fiveParagraph, 10, y, { maxWidth: 190 });
            y += 10;

            // Add signature
            if (signature) {
                const img = await this.helpers.loadImage(signature);
                const base64Img = img.toString('base64');

                const sigWidth = 50;
                const sigHeight = 20;

                doc.addImage(`data:image/png;base64,${base64Img}`, 'PNG', 10, y, sigWidth, sigHeight);

                // Add line and text under signature
                const lineY = y + sigHeight + 2;
                doc.line(10, lineY, 10 + sigWidth, lineY);
                this.helpers.addText(doc, "Firma del solicitante", 10, lineY + 6);

                // Add document number beside signature
                const docX = 70;
                const docY = y + sigHeight / 1;
                this.helpers.addText(doc, numberDocument, docX, docY);
                doc.line(docX, docY + 2, docX + 40, docY + 2);
                this.helpers.addText(doc, "C.C.", docX, docY + 6);
            }

            // Return PDF as buffer
            return Buffer.from(doc.output('arraybuffer'));
        } catch (error) {
            this.logger.error('Error generating promissory note PDF', error);
            throw error;
        }
    }
}