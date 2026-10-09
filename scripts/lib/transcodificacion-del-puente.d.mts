export declare const RTSP_INTERNO: string;

export declare const politicaDeTranscodificacion: (
  valor: string | undefined,
) =>
  | { readonly politica: 'auto' | 'nunca'; readonly error: null }
  | { readonly politica: null; readonly error: string };

export declare const escuchaRtspInterna: (politica: 'auto' | 'nunca') => string;

export declare const buscarFfmpeg: (
  path: string | undefined,
  existe?: (ruta: string) => boolean,
) => string | null;

export declare const juzgarFfmpeg: (
  politica: 'auto' | 'nunca',
  ruta: string | null,
) => { readonly falta: boolean; readonly frase: string };

export declare const puenteDelEnsayo: (env: NodeJS.ProcessEnv) => {
  readonly puente?: { readonly url: string; readonly transcodificar: string };
};
