import type { MenorDelHogar, MiAutorizacion, MisOcupantes, PlazaDeOcupante } from './api/residente';
import { puedeTenerCuenta } from './registro/edad';

/**
 * 15-Y2 · las reglas del HOGAR que la app ya aplica en Dart
 * (`dominio/plazas.dart`, `dominio/menores.dart`, `dominio/revocacion.dart`,
 * `dominio/vehiculos_propios.dart`), repetidas aquí con sus pruebas para que
 * la consola enseñe lo mismo que el teléfono. Son funciones puras: nada de
 * I/O, nada de React. El servidor decide de verdad; esto es lo que se ve.
 */

export const TIPOS_DE_DOCUMENTO_DE_MENOR = [
  { valor: 'tarjeta_identidad', etiqueta: 'Tarjeta de identidad' },
  { valor: 'registro_civil', etiqueta: 'Registro civil' },
] as const;
export type TipoDeDocumentoDeMenor = (typeof TIPOS_DE_DOCUMENTO_DE_MENOR)[number]['valor'];

/** Longitudes mínimas de los motivos, las mismas que valida la API. */
export const MOTIVO_MINIMO_DE_RETIRO = 3;
export const MOTIVO_MINIMO_DE_BAJA = 5;
export const MOTIVO_MINIMO_DE_REVOCACION = 1;
export const MOTIVO_MAXIMO_DE_REVOCACION = 200;
export const DOCUMENTO_MINIMO_DE_MENOR = 4;

export const AVISO_DEL_TOPE = 'Para más plazas, pídalo a la administración';

export const SOLO_EL_TITULAR = 'Sólo el titular de la vivienda añade y retira plazas.';

/** «3 de 4». */
export const cupoDePlazas = (o: Pick<MisOcupantes, 'plazas' | 'tope'>): string =>
  `${String(o.plazas.length)} de ${String(o.tope)}`;

export const plazasLibres = (o: Pick<MisOcupantes, 'plazas'>): readonly PlazaDeOcupante[] =>
  o.plazas.filter((p) => p.libre);

export const alTope = (o: Pick<MisOcupantes, 'plazas' | 'tope'>): boolean =>
  o.plazas.length >= o.tope;

export const puedeAnadirPlaza = (o: Pick<MisOcupantes, 'plazas' | 'tope' | 'esTitular'>): boolean =>
  o.esTitular && !alTope(o);

/** La plaza 1 es la del titular: no se retira. Sólo las libres, y sólo el titular. */
export const sePuedeRetirar = (
  o: Pick<MisOcupantes, 'esTitular'>,
  plaza: Pick<PlazaDeOcupante, 'libre' | 'numero'>,
): boolean => o.esTitular && plaza.libre && plaza.numero !== 1;

export const documentoLegibleDeMenor = (
  m: Pick<MenorDelHogar, 'tipoDocumento' | 'documento'>,
): string =>
  `${TIPOS_DE_DOCUMENTO_DE_MENOR.find((t) => t.valor === m.tipoDocumento)?.etiqueta ?? 'Documento'} ${m.documento}`;

/** Ya cumplió 18 (ADR-038): puede crear su propia cuenta con el código de traspaso. */
export const yaEsMayor = (m: Pick<MenorDelHogar, 'edad'>): boolean =>
  m.edad !== null && puedeTenerCuenta(m.edad);

/** La línea de detalle de un menor: parentesco · edad · documento · plaza. */
export const detalleDeMenor = (m: MenorDelHogar): string =>
  [
    m.parentesco,
    m.edad === null ? null : `${String(m.edad)} años`,
    documentoLegibleDeMenor(m),
    m.plazaNumero === null ? null : `plaza ${String(m.plazaNumero)}`,
  ]
    .filter((x): x is string => x !== null && x !== '')
    .join(' · ');

export const sePuedeRevocar = (a: Pick<MiAutorizacion, 'situacion'>): boolean =>
  a.situacion === 'vigente' || a.situacion === 'programada';

export const textoDeRevocacion = (r: {
  readonly equiposRetirados: number;
  readonly equiposPendientes: number;
}): string => {
  const partes = [
    r.equiposRetirados > 0 ? `Su foto salió de ${String(r.equiposRetirados)} equipo(s)` : null,
    r.equiposPendientes > 0
      ? `${String(r.equiposPendientes)} más la retirará en cuanto responda`
      : null,
  ].filter((x): x is string => x !== null);
  return partes.length === 0 ? 'Visita revocada.' : `Visita revocada. ${partes.join('; ')}.`;
};

export const textoDeEliminacion = (resultado: 'borrado' | 'dado_de_baja', placa: string): string =>
  resultado === 'borrado'
    ? `Vehículo ${placa} eliminado.`
    : `El vehículo ${placa} ya tenía historial en el conjunto: quedó dado de baja y su historial se conserva.`;

/** Una placa sólo cuenta como cambiada si difiere sin separadores ni minúsculas. */
export const placaSinSeparadores = (placa: string): string =>
  placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
