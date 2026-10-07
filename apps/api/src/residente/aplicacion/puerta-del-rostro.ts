import type { MedidasDeCaptura, MotivoRechazoCaptura } from '@ncr/domain-core';
import { revisarFoto } from '../../visitas';
import type { EstadoDeMiRostro } from './estado-del-rostro';
import { CAPTURAS_DE_ROSTRO_POR_DIA } from './politica-del-rostro';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · LA PUERTA DEL ROSTRO, común al propio (D2) y al de un menor (D3)
 *
 * Antes de crear nada: la política que se aceptó es la vigente (409 si cambió),
 * la foto es JPEG o PNG por sus BYTES y del tamaño admitido ANTES de
 * decodificarla (400), sirve para reconocer (400, con los motivos), y la cuenta
 * no pasó de 5 capturas en 24 h —propias y de sus menores, contadas en la
 * base— (429 con el momento en que se libera un hueco, §2.7.5).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface FotoDeRostro {
  readonly contenidoBase64: string;
  readonly tipoMime: string;
  readonly medidas: MedidasDeCaptura;
  readonly versionPolitica: string;
}

export type ResultadoDeMiRostro =
  | { readonly hecho: true; readonly estado: EstadoDeMiRostro }
  | {
      readonly hecho: false;
      /** 403 sólo en el de un menor: quien pregunta no es el titular del hogar. */
      readonly estado: 400 | 403 | 404 | 409 | 429;
      readonly explicacion: string;
      readonly motivos?: readonly MotivoRechazoCaptura[];
      readonly reintentarEnS?: number;
      /** D3 · por qué no se registra el de un menor: su edad. */
      readonly codigo?: 'EDAD_INSUFICIENTE' | 'YA_ES_MAYOR' | 'SIN_FECHA';
    };

export type RechazoDelRostro = Extract<ResultadoDeMiRostro, { hecho: false }>;

export const DIA_MS = 24 * 3600 * 1000;

export const rechazo = (
  estado: RechazoDelRostro['estado'],
  explicacion: string,
  extra: Omit<RechazoDelRostro, 'hecho' | 'estado' | 'explicacion'> = {},
): RechazoDelRostro => ({ hecho: false, estado, explicacion, ...extra });

/** Política vigente, foto admisible y tope de 24 h de ESTA cuenta: `null` si se puede seguir. */
export const rechazoAntesDeCapturar = async (
  foto: FotoDeRostro,
  versionVigente: string,
  capturasRecientes: () => Promise<readonly Date[]>,
  ahora: Date,
): Promise<RechazoDelRostro | null> => {
  if (foto.versionPolitica !== versionVigente) {
    return rechazo(409, 'La política del rostro cambió: léala y acéptela de nuevo');
  }
  const revisada = revisarFoto({
    contenidoBase64: foto.contenidoBase64,
    tipoMime: foto.tipoMime,
    medidas: foto.medidas,
  });
  if (!revisada.ok) return rechazo(400, revisada.error.detalle);
  if (!revisada.valor.aceptada) {
    return rechazo(400, 'La foto no sirve para reconocer el rostro', {
      motivos: revisada.valor.motivos,
    });
  }
  const capturas = await capturasRecientes();
  if (capturas.length < CAPTURAS_DE_ROSTRO_POR_DIA) return null;
  // Se libera un hueco cuando la quinta más reciente cumple 24 h.
  const libera = capturas[capturas.length - CAPTURAS_DE_ROSTRO_POR_DIA] ?? ahora;
  return rechazo(
    429,
    `Ya registró un rostro ${String(CAPTURAS_DE_ROSTRO_POR_DIA)} veces en 24 horas`,
    {
      reintentarEnS: Math.max(1, Math.ceil((libera.getTime() + DIA_MS - ahora.getTime()) / 1000)),
    },
  );
};
