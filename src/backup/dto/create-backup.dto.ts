// Exportamos la interfaz para que sea accesible desde el controlador
export class BackupInfo {
    name: string;
    timeCreated: string;
    size: string;
    downloadUrl?: string;
  }
  
  // Interfaces para respuestas de los métodos
  export interface BackupResponse {
    success: boolean;
    message: string;
    path?: string;
  }
  
  export interface ListBackupsResponse {
    success: boolean;
    backups?: BackupInfo[];
    message?: string;
  }
  
  export interface DownloadUrlResponse {
    success: boolean;
    downloadUrl?: string;
    message?: string;
    expiresIn?: string
  }