export class CreateLoanApplicationDto {
  userId: string;
  entity: string;
  bankNumberAccount: string;
  cantity: string;
  signature: string;
  upSignatureId: string;
  terms_and_conditions: boolean;
  labor_card: string | null;
  upid_labor_card: string | null;
  fisrt_flyer: string | null;
  upid_first_flayer: string | null;
  second_flyer: string | null;
  upid_second_flyer: string | null;
  third_flyer: string | null;
  upid_third_flayer: string | null;
  isValorAgregado?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class PreCreateLoanApplicationDto {
  id?: string
  userId: string;
  entity: string;
  bankNumberAccount: string;
  cantity: string;
  signature: string;
  terms_and_conditions: boolean;
  labor_card: Express.Multer.File | null;
  fisrt_flyer: Express.Multer.File | null;
  second_flyer: Express.Multer.File | null;
  third_flyer: Express.Multer.File | null;
  isValorAgregado?: boolean;
  token: string;
  created_at: Date;
  updated_at: Date;
}