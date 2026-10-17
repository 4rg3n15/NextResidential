export declare const candidatosDeEjecutable: (
  base: string,
  plataforma?: NodeJS.Platform,
) => readonly string[];

export declare const necesitaShell: (nombre: string, plataforma?: NodeJS.Platform) => boolean;

export declare const versionEnAgente: (
  agente: string | undefined,
  gestor: string,
) => string | null;
