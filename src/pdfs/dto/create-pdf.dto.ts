export interface TextOptions {
  maxWidth?: number;
}

export interface DocumentData {
  TitlePrevExplain: string;
  prevExplain: string;
  headerTitle: string;
  firstExplainText: string;
  secondTitle: string;
  optionAccount: {
    numberAccount: string;
    entityAccount: string;
  };
  threeTitle: string;
  justifyText: string;
  numberOnce: string;
  textOnce: string;
  finalTitle: string;
  subFinalText: string;
  finalText: string;
}

export interface PromissoryNoteData {
  logoHeader: string;
  numero_pagare: {
    publicText: string;
    publicId: string;
  };
  fecha_vencimiento: {
    publicText: string;
    date: string;
  };
  firstParagraph: {
    namePerson: string;
    publicfirstText: string;
    numberDocument: string;
    publicSecondText: string;
    payDay: string;
    publicFiveText: string;
    payQuantity: string;
  };
  secondParagraph: string;
  threeParagraph: string;
  fourParagraph: string;
  fiveParagraph: {
    publicFirstText: string;
    publicSecondText: string;
    dayPay: string;
  };
  signature: string;
  numberDocument: string;
}

export interface DocumentGenerationParams {
  documentType: string;
  numberDocument: string;
  entity: string;
  numberBank: string;
  signature?: string;
  userId: string;
  documentData: DocumentData;
}

export interface PromissoryNoteGenerationParams {
  documentType: string;
  name: string;
  numberDocument: string;
  signature?: string;
  userId: string;
  payDay?: string;
  payQuantity?: string;
  dayPay?: string;
  logoUrl?: string;
}