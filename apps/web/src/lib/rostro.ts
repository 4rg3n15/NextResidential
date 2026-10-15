import type { EstadoDeMiRostro, MenorDelHogar } from './api/residente';
import type { FalloDeCalidad } from './biometria/medidas';
import { puedeTenerCuenta } from './registro/edad';

/**
 * 15-Y3 · las reglas y los textos del ROSTRO que la app ya aplica en Dart
 * (`dominio/rostro.dart`, `dominio/rostro_de_menor.dart`,
 * `presentacion/textos_del_rostro.dart`, `dominio/calidad_de_captura.dart`),
 * repetidos aquí con sus pruebas para que la consola diga lo mismo que el
 * teléfono. Funciones puras: sin React, sin red, sin cámara.
 */

export type EstadoDelRostro = EstadoDeMiRostro['estado'];
export type EstadoEnEquipo = EstadoDeMiRostro['equipos'][number]['estado'];

/** Con rostro salvo «sin rostro» y «en retiro». */
export const tieneRostro = (estado: EstadoDelRostro): boolean =>
  estado !== 'sin_rostro' && estado !== 'en_retiro';

const porVencer = (dias: number | null): string => {
  if (dias === null || dias === 0)
    return 'Su rostro vence hoy: renuévelo para seguir entrando con él.';
  if (dias === 1) return 'Su rostro vence mañana: renuévelo para seguir entrando con él.';
  return `Su rostro vence en ${String(dias)} días: renuévelo para seguir entrando con él.`;
};

export const textoDelEstado = (
  e: Pick<
    EstadoDeMiRostro,
    'estado' | 'equiposConRostro' | 'equiposConMiRostro' | 'diasParaVencer'
  >,
): string => {
  switch (e.estado) {
    case 'sin_rostro':
      return 'No ha registrado su rostro. Es opcional: puede entrar sin él.';
    case 'en_retiro':
      return 'Su rostro se está retirando de los equipos de la portería.';
    case 'pendiente':
      return e.equiposConRostro === 0
        ? 'Registrado. El conjunto todavía no tiene equipos que reconozcan rostros.'
        : 'Registrado. Se está enviando a los equipos de la portería.';
    case 'parcial':
      return `Registrado en ${String(e.equiposConMiRostro)} de ${String(e.equiposConRostro)} equipos. Los demás lo recibirán en cuanto respondan.`;
    case 'activa':
      return e.equiposConRostro === 1
        ? 'Activo: el equipo de la portería lo reconoce.'
        : `Activo: los ${String(e.equiposConRostro)} equipos de la portería lo reconocen.`;
    case 'por_vencer':
      return porVencer(e.diasParaVencer);
  }
};

export const textoDelEquipo = (e: EstadoEnEquipo): string => {
  switch (e) {
    case 'sincronizada':
      return 'Lo reconoce';
    case 'pendiente':
      return 'Pendiente';
    case 'fallida':
      return 'No lo recibió todavía';
  }
};

export interface TextosDelRostro {
  readonly titulo: string;
  readonly registrar: string;
  readonly renovar: string;
  readonly retirar: string;
  readonly acepto: string;
  /** ADR-039 · las dos declaraciones del representante legal; ninguna para el propio. */
  readonly declaraciones: readonly string[];
}

/** `null` para el propio; el nombre del menor para el suyo. */
export const textosDelRostro = (nombreDelMenor: string | null): TextosDelRostro =>
  nombreDelMenor === null
    ? {
        titulo: 'Mi rostro',
        registrar: 'Registrar mi rostro',
        renovar: 'Renovar mi rostro',
        retirar: 'Retirar mi rostro',
        acepto: 'Leí y acepto la política del tratamiento de mi rostro',
        declaraciones: [],
      }
    : {
        titulo: `Rostro de ${nombreDelMenor}`,
        registrar: 'Registrar su rostro',
        renovar: 'Renovar su rostro',
        retirar: 'Retirar su rostro',
        acepto: 'Leí y acepto, como su representante, la política del tratamiento de su rostro',
        declaraciones: [
          'Soy su representante legal',
          'Le expliqué para qué es su rostro y está de acuerdo',
        ],
      };

export const EDAD_MINIMA_DEL_ROSTRO_DE_MENOR = 15;

export type RostroDelMenorEnLaWeb =
  | 'gestionar'
  | 'solo_el_titular'
  | 'desde_los_15'
  | 'ya_es_mayor'
  | 'sin_fecha';

/** ADR-039 · de 15 a 17, y sólo el titular; a los 18 crea su cuenta; sin fecha no se sabe. */
export const rostroDelMenorEnLaWeb = (
  m: Pick<MenorDelHogar, 'edad'>,
  esTitular: boolean,
): RostroDelMenorEnLaWeb => {
  if (m.edad === null) return 'sin_fecha';
  if (puedeTenerCuenta(m.edad)) return 'ya_es_mayor';
  if (m.edad < EDAD_MINIMA_DEL_ROSTRO_DE_MENOR) return 'desde_los_15';
  return esTitular ? 'gestionar' : 'solo_el_titular';
};

export const explicacionDelRostroDelMenor = (r: RostroDelMenorEnLaWeb): string | null => {
  switch (r) {
    case 'gestionar':
    case 'ya_es_mayor':
      return null;
    case 'solo_el_titular':
      return 'Lo registra el titular del hogar.';
    case 'desde_los_15':
      return 'No se registra el rostro de menores de 15 años.';
    case 'sin_fecha':
      return 'Registre su fecha de nacimiento para poder registrar su rostro.';
  }
};

/** Los consejos de la foto con las palabras de la app (`consejoPara`), no los de la consola de visitantes. */
export const CONSEJOS_DEL_RESIDENTE: Readonly<Record<FalloDeCalidad, string>> = {
  BORROSA: 'La foto salió movida. Sostenga el teléfono quieto y repita.',
  OSCURA: 'Hay poca luz. Busque un sitio más iluminado.',
  QUEMADA: 'Hay demasiada luz de frente. Evite el sol o la lámpara detrás de usted.',
  SIN_ROSTRO: 'No se ve ningún rostro. Encuadre la cara de la persona.',
  VARIOS_ROSTROS: 'Se ve más de una persona. La foto debe ser de una sola.',
  DEMASIADO_LEJOS: 'Acérquese: el rostro se ve muy pequeño.',
  DEMASIADO_CERCA: 'Aléjese un poco: el rostro no cabe en el encuadre.',
};

/** «Ahora no» de la invitación del primer ingreso se recuerda por cuenta, como en la app. */
export const claveDeAhoraNo = (cuenta: string): string => `ncr.rostro.ahora-no.${cuenta}`;
