import { jsPDF } from "jspdf";
import { TextOptions } from "../dto/create-pdf.dto";
import { Injectable } from "@nestjs/common";

@Injectable()
export class HelpersPDFService {
    /**
     * Adds text to the PDF document with the provided options
     */
    addText(
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
    async loadImage(src: string): Promise<Buffer> {
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
    addSignature(
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
}