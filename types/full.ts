// Enums
export enum UserCompany {
    INCAUCA_SAS = "incauca_sas",
    INCAUCA_COSECHA = "incauca_cosecha",
    PROVIDENCIA_SAS = "providencia_sas",
    PROVIDENCIA_COSECHA = "providencia_cosecha",
    CON_ALTA = "con_alta",
    PICHICHI_SAS = "pichichi_sas",
    PICHICHI_COORTE = "pichichi_coorte",
    VALOR_AGREGADO = "valor_agregado",
    NONE = "no"
}

export enum DocumentType {
    CITIZENSHIP_CARD = "CC",
    FOREIGNER_ID = "CE",
    PASSPORT = "PASAPORTE"
}

export enum LoanStatus {
    PENDING = "Pendiente",
    APPROVED = "Aprobado",
    POSTPONED = "Aplazado",
    DRAFT = "Borrador",
    ARCHIVED = "Archivado"
}

export enum IntranetRole {
    ADMIN = "admin",
    EMPLOYEE = "employee"
}

export enum IssueStatus {
    ACTIVE = "activo",
    PENDING = "pendiente",
    FIXED = "corregido"
}

export enum IssuePriority {
    LOW = "Baja",
    MEDIUM = "Media",
    HIGH = "Alta",
    CRITICAL = "Critica"
}

export enum ApplicationType {
    INTRANET = "intranet",
    CLIENTS = "clients"
}

export enum SessionStatus {
    ACTIVE = "activo",
    REVOKED = "revocado"
}

// Types
export type User = {
    id: string;
    password: string;
    email: string;
    names: string;
    firstLastName: string;
    secondLastName: string;
    currentCompany: UserCompany;
    avatar: string;
    phone: string;
    residence_phone_number: string;
    phone_whatsapp: string;
    birth_day?: Date;
    place_of_birth?: string;
    gender: string;
    residence_address: string;
    city: string;
    isBanned?: boolean;
    createdAt: Date;
    updatedAt: Date;

    // Relations
    Document: Document[];
    loanApplications: ILoanApplication[];
}

export type Document = {
    id: string;
    userId: string;
    documentSides: string;
    upId: string;
    imageWithCC: string;
    typeDocument: DocumentType;
    number: string;
    createdAt: Date;
    updatedAt: Date;

    // Relations
    user: User;
}

export type IntranetUser = {
    id: string;
    name: string;
    lastNames: string;
    email: string;
    password: string;
    phone: string;
    role: string;
    isActive: boolean;
    avatar: string;
    updatedAt: Date;
    createdAt: Date;
}

export type ILoanApplication = {
    id: string;
    userId: string;
    employeeId?: string; // @default("Standby")
    fisrt_flyer?: string;
    upid_first_flayer?: string;
    second_flyer?: string;
    upid_second_flyer?: string;
    third_flyer?: string;
    upid_third_flayer?: string;
    reasonReject?: string;
    reasonChangeCantity?: string;
    cantity: string;
    newCantity?: string;
    newCantityOpt?: boolean;
    bankSavingAccount: boolean;
    bankNumberAccount: string;
    entity: string;
    labor_card?: string;
    upid_labor_card?: string;
    terms_and_conditions: boolean;
    signature: string;
    upSignatureId: string;
    status: LoanStatus;
    created_at: Date;
    updated_at: Date;

    // Relaciones
    user: User;
    GeneratedDocuments: GeneratedDocument[];
};


export type GeneratedDocument = {
    id: string;
    loanId: string;
    uploadId: string;
    publicUrl?: string;
    fileType: string;
    documentTypes: string[];
    downloadCount: number;
    createdAt: Date;
    updatedAt: Date;

    // Relations
    loanApplication: ILoanApplication;
}

export type WhatsappSession = {
    id: string;
    sessionId: string;
    status: SessionStatus;
    createdAt: Date;
    updatedAt: Date;
}

export type IssueReport = {
    id: string;
    description: string;
    images: string[];
    application: ApplicationType;
    status: IssueStatus;
    priority?: IssuePriority;
    supportResponse?: string;
    createdAt: Date;
    updatedAt: Date;
}

// Interface for relationships
export interface DatabaseSchema {
    users: User[];
    documents: Document[];
    intranetUsers: IntranetUser[];
    loanApplications: ILoanApplication[];
    generatedDocuments: GeneratedDocument[];
    whatsappSessions: WhatsappSession[];
    issueReports: IssueReport[];
}