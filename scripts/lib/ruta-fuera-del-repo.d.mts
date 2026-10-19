export declare const barrasComidas: (ruta: string | undefined) => boolean;

export declare const ejemploDeRutaDeSalida: (plataforma?: NodeJS.Platform) => string;

export declare const mensajeDeRutaDentroDelRepo: (
  pedida: string,
  resuelta: string,
  que: string,
  plataforma?: NodeJS.Platform,
) => string;

export declare const rutaFueraDelRepo: (
  pedida: string,
  que: string,
  raiz: string,
  salir: (mensaje: string) => never,
  plataforma?: NodeJS.Platform,
) => string;
