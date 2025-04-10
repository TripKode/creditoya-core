export interface OptionAccountSkeleton00 {
  numberAccount: string;
  entityAccount: string;
}

// SkeletonJson00Type is already defined in your code
export interface SkeletonJson00Type {
  TitlePrevExplain: string;
  prevExplain: string;
  headerTitle: string;
  firstExplainText: string;
  secondTitle: string;
  optionAccount: OptionAccountSkeleton00;
  threeTitle: string;
  justifyText: string;
  numberOnce: string;
  textOnce: string;
  finalTitle: string;
  subFinalText: string;
  finalText: string;
}

// Interface for skeletonJson01
export interface SkeletonJson01Type {
  firstParagraph: string;
  firstText: string;
  secondText: string;
  secondParagraph: string;
  inst01: string;
  inst02: string;
  inst03: string;
  inst04: string;
  inst05: string;
  finalSecondParagraph: string;
  threeParagraph: string;
  fourParagraph: string;
}

// Interface for skeletonJson02
export interface SkeletonJson02Type {
  title: string;
  firstParagraph: string;
  subFirstParagraph: string;
  secondParagraph: string;
  thirdParagraph: string;
  footer: string;
}

// Interface for skeletonSubJson02
export interface SkeletonSubJson02Type {
  title: string;
  firstParagraph: string;
  subFirstParagraph: string;
  TwoSubFirstParagraph: string;
  ThreeSubFirstParagraph: string;
  FourSubFirstParagraph: string;
  FiveSubFirstParagraph: string;
  secondParagraph: string;
  thirdParagraph: string;
  footer: string;
}

// Interface for nested objects in skeletonJson03
export interface NumeroPagare {
  publicText: string;
  publicId: string;
}

export interface FechaVencimiento {
  publicText: string;
  date: string;
}

export interface FirstParagraph {
  namePerson: string;
  publicfirstText: string;
  numberDocument: string;
  publicSecondText: string;
  payDay: string;
  publicFiveText: string;
  payQuantity: string;
}

export interface FiveParagraph {
  publicFirstText: string;
  publicSecondText: string;
  dayPay: string;
}

// Interface for skeletonJson03
export interface SkeletonJson03Type {
  logoHeader: string;
  numero_pagare: NumeroPagare;
  fecha_vencimiento: FechaVencimiento;
  firstParagraph: FirstParagraph;
  secondParagraph: string;
  threeParagraph: string;
  fourParagraph: string;
  fiveParagraph: FiveParagraph;
  signature: string;
  numberDocument: string;
}



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
  accountNumber: string;
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

export interface BaseDocumentParams {
  signature: string;
  numberDocument: string;
  autoDownload?: boolean;
  entity?: string,
  accountNumber?: string
}

export interface AboutLoanParams extends BaseDocumentParams {
  documentType: 'about-loan';
}

export interface NamedDocumentParams extends BaseDocumentParams {
  name: string;
}

export interface InstructionLetterParams extends NamedDocumentParams {
  documentType: 'instruction-letter';
}

export interface SalaryPaymentParams extends NamedDocumentParams {
  documentType: 'salary-payment-authorization';
}

export interface PromissoryNoteParams extends NamedDocumentParams {
  documentType: 'promissory-note';
}

// Union type of all possible document parameters
export type DocumentParams = AboutLoanParams | InstructionLetterParams | SalaryPaymentParams | PromissoryNoteParams;