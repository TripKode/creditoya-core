import { Injectable } from "@nestjs/common";
import {
    DocumentGenerationParams,
    DocumentParams,
    PromissoryNoteGenerationParams,
} from "../dto/create-pdf.dto";

@Injectable()
export class TransformerPDFService {
    /**
     * Transforms document parameters from the API format to the internal format
     */
    transformParameters(
        documentsParams: Array<DocumentGenerationParams | PromissoryNoteGenerationParams>
    ): Array<DocumentParams> {
        return documentsParams.map(param => this.transformSingleParameter(param));
    }

    private transformSingleParameter(
        param: DocumentGenerationParams | PromissoryNoteGenerationParams
    ): DocumentParams {
        const documentType = this.determineDocumentType(param);

        const transformedParam: any = {
            documentType,
            signature: param.signature,
            numberDocument: param.numberDocument,
        };

        this.addOptionalParameters(param, transformedParam);

        return transformedParam as DocumentParams;
    }

    private determineDocumentType(
        param: DocumentGenerationParams | PromissoryNoteGenerationParams
    ): string {
        if ('documentType' in param) {
            return param.documentType;
        }

        if ('name' in param) {
            return 'promissory-note';
        }

        return 'about-loan';
    }

    private addOptionalParameters(
        param: DocumentGenerationParams | PromissoryNoteGenerationParams,
        transformedParam: any
    ): void {
        if ('name' in param && param.name) {
            transformedParam.name = param.name;
        }

        if ('autoDownload' in param) {
            transformedParam.autoDownload = param.autoDownload;
        }

        if ('entity' in param) {
            transformedParam.entity = param.entity;
        }

        if ('accountNumber' in param) {
            transformedParam.accountNumber = param.accountNumber;
        }
    }
}