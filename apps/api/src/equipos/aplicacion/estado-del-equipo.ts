import type { UmbralDeLatido } from '@ncr/domain-core';
import { UMBRAL_DE_LATIDO_POR_DEFECTO } from '@ncr/domain-core';
import type { ClaseDeSondeo } from './puertos';
import type { SenalDeEventos } from './senal-de-eventos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E5 (ETAPA 15-M) · UNA SOLA FUENTE DE VERDAD DEL ESTADO DE UN EQUIPO
 *
 * En sitio (28/09) la lista decía «Fuera de línea» de un videoportero cuya
 * escucha entregaba eventos, la terminal salía «En línea» mientras su ficha
 * decía «rechazó la clave», y `estado_salud` valía `saludable` en un equipo
 * inalcanzable. Tres pantallas, tres criterios. Esta función es el único
 * criterio: la lista, la ficha y el tablero la llaman con las MISMAS entradas.
 *
 * Es pura: reloj inyectado, cero I/O. Las entradas son las cinco señales que
 * el proceso conoce de un equipo, cada una con su instante; la salida dice en
 * qué estado está y POR QUÉ, en una frase que la consola enseña tal cual.
 *
 * Orden de decisión (la primera que aplica manda):
 *  1 · credencial rechazada más reciente que la última señal de vida → degradado;
 *  2 · escucha rechazada por otra plataforma → degradado (vivo, pero mudo);
 *  3 · sin ninguna señal jamás → sin_comprobar (no es «caído»: nadie miró);
 *  4 · la señal de vida más reciente contra el umbral de latido de la
 *      copropiedad → en_linea / degradado / fuera_de_linea.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type EnLinea = 'en_linea' | 'degradado' | 'fuera_de_linea' | 'sin_comprobar';
export type EstadoDeAutenticacion = 'aceptada' | 'rechazada' | 'sin_comprobar';
export type EstadoDeEscucha = 'abierta' | 'cerrada' | 'rechazada' | 'no_aplica';

export interface EntradasDeEstado {
  /** Último sondeo (consola o latido), con su desenlace. `null` = nunca. */
  readonly ultimoSondeo: { readonly clase: ClaseDeSondeo; readonly en: Date } | null;
  /** Última vez que el equipo rechazó la clave. `null` = no consta. */
  readonly credencialRechazadaEn: Date | null;
  /** La escucha del proceso (terminal, videoportero); `null` si no hay. */
  readonly escucha: SenalDeEventos | null;
  /** Último evento recibido del equipo por cualquier transporte. */
  readonly ultimoEvento: Date | null;
  /** `dispositivos.ultimo_latido`. */
  readonly ultimoLatido: Date | null;
  readonly umbral?: UmbralDeLatido;
}

export interface EstadoDelEquipo {
  readonly enLinea: EnLinea;
  readonly motivo: string;
  /** `null` mientras nadie lo haya sondeado. */
  readonly alcanzable: boolean | null;
  readonly autenticacion: EstadoDeAutenticacion;
  /** Minutos desde el rechazo, cuando `autenticacion === 'rechazada'`. */
  readonly autenticacionRechazadaHaceMin: number | null;
  readonly escucha: EstadoDeEscucha;
  readonly ultimoEvento: Date | null;
  readonly ultimoLatido: Date | null;
  /** La señal de vida más reciente de todas, la que decide `enLinea`. */
  readonly ultimaSenal: Date | null;
}

const masReciente = (...fechas: readonly (Date | null)[]): Date | null =>
  fechas.reduce<Date | null>(
    (mejor, f) => (f === null ? mejor : mejor === null || f > mejor ? f : mejor),
    null,
  );

const minutos = (desde: Date, ahora: Date): number =>
  Math.max(0, Math.round((ahora.getTime() - desde.getTime()) / 60_000));

const segundos = (desde: Date, ahora: Date): number =>
  Math.max(0, Math.round((ahora.getTime() - desde.getTime()) / 1000));

const estadoDeEscucha = (escucha: SenalDeEventos | null): EstadoDeEscucha => {
  if (escucha === null) return 'no_aplica';
  if ((escucha.rechazo ?? null) !== null) return 'rechazada';
  return escucha.transporte === 'ninguna' ? 'cerrada' : 'abierta';
};

/** Convierte una frase larga del proveedor en su primera oración. */
const primeraOracion = (texto: string): string => texto.split(/[.:]\s/)[0] ?? texto;

export const estadoDelEquipo = (e: EntradasDeEstado, ahora: Date): EstadoDelEquipo => {
  const umbral = e.umbral ?? UMBRAL_DE_LATIDO_POR_DEFECTO;
  const senalDeEscucha = e.escucha?.ultimaSenal ?? null;
  const sondeoVivo =
    e.ultimoSondeo !== null && e.ultimoSondeo.clase !== 'inalcanzable' ? e.ultimoSondeo.en : null;
  const ultimaSenal = masReciente(e.ultimoLatido, e.ultimoEvento, senalDeEscucha, sondeoVivo);
  const escucha = estadoDeEscucha(e.escucha);

  const rechazoVigente =
    e.credencialRechazadaEn !== null &&
    (ultimaSenal === null || e.credencialRechazadaEn >= ultimaSenal)
      ? e.credencialRechazadaEn
      : e.ultimoSondeo?.clase === 'credencial'
        ? e.ultimoSondeo.en
        : null;
  const autenticacion: EstadoDeAutenticacion =
    rechazoVigente !== null
      ? 'rechazada'
      : e.ultimoSondeo === null
        ? 'sin_comprobar'
        : e.ultimoSondeo.clase === 'inalcanzable'
          ? 'sin_comprobar'
          : 'aceptada';
  const alcanzable =
    e.ultimoSondeo === null
      ? ultimaSenal === null
        ? null
        : true
      : e.ultimoSondeo.clase !== 'inalcanzable' ||
        (ultimaSenal !== null && ultimaSenal > e.ultimoSondeo.en);

  const base = {
    alcanzable,
    autenticacion,
    autenticacionRechazadaHaceMin: rechazoVigente === null ? null : minutos(rechazoVigente, ahora),
    escucha,
    ultimoEvento: e.ultimoEvento,
    ultimoLatido: e.ultimoLatido,
    ultimaSenal,
  };

  if (rechazoVigente !== null) {
    return {
      ...base,
      enLinea: 'degradado',
      motivo: `Contesta, pero rechazó el usuario o la clave hace ${String(minutos(rechazoVigente, ahora))} min: corríjalos en la edición o pulse «Probar conexión» antes de reintentar`,
    };
  }
  if (escucha === 'rechazada') {
    return {
      ...base,
      enLinea: 'degradado',
      motivo: `Contesta, pero rechaza la escucha: ${primeraOracion(e.escucha?.rechazo ?? 'otra plataforma tiene la conexión')}`,
    };
  }
  if (ultimaSenal === null) {
    return {
      ...base,
      enLinea: 'sin_comprobar',
      motivo:
        e.ultimoSondeo === null
          ? 'Nadie lo ha sondeado todavía y no ha mandado nada'
          : 'El último sondeo no lo alcanzó y no ha mandado nada desde entonces',
    };
  }
  const silencio = segundos(ultimaSenal, ahora);
  if (silencio >= umbral.silencioParaCaidoSegundos) {
    return {
      ...base,
      enLinea: 'fuera_de_linea',
      motivo: `Sin señal desde hace ${String(silencio)} s (umbral ${String(umbral.silencioParaCaidoSegundos)} s)`,
    };
  }
  const tolerado = umbral.periodoSegundos * (umbral.latidosTolerados + 1);
  if (silencio > tolerado) {
    return {
      ...base,
      enLinea: 'degradado',
      motivo: `Última señal hace ${String(silencio)} s: más de lo tolerado (${String(tolerado)} s)`,
    };
  }
  const via =
    senalDeEscucha !== null && senalDeEscucha.getTime() === ultimaSenal.getTime()
      ? 'su escucha'
      : e.ultimoEvento !== null && e.ultimoEvento.getTime() === ultimaSenal.getTime()
        ? 'un evento'
        : sondeoVivo !== null && sondeoVivo.getTime() === ultimaSenal.getTime()
          ? 'el sondeo'
          : 'su latido';
  return {
    ...base,
    enLinea: 'en_linea',
    motivo: `Con señal hace ${String(silencio)} s por ${via}`,
  };
};

/** El estado unificado, en el enumerado de la base (`estado_dispositivo`). */
export const aEstadoSalud = (enLinea: EnLinea): 'saludable' | 'degradado' | 'caido' =>
  enLinea === 'en_linea' ? 'saludable' : enLinea === 'degradado' ? 'degradado' : 'caido';

/**
 * Las entradas a partir de lo persistido (`DatosDeEquipo`, 0044) y de la señal
 * de la escucha del proceso. Es la ÚNICA traducción: la lista, la ficha y el
 * tablero la comparten para que no vuelvan a divergir.
 */
export const entradasDeEstado = (
  e: {
    readonly ultimoLatido: string | null;
    readonly sondeadoEn: string | null;
    readonly ultimoSondeo: ClaseDeSondeo | null;
    readonly credencialRechazadaEn: string | null;
    readonly umbralDeLatido: UmbralDeLatido | null;
  },
  escucha: SenalDeEventos | null,
): EntradasDeEstado => ({
  ultimoSondeo:
    e.sondeadoEn === null || e.ultimoSondeo === null
      ? null
      : { clase: e.ultimoSondeo, en: new Date(e.sondeadoEn) },
  credencialRechazadaEn:
    e.credencialRechazadaEn === null ? null : new Date(e.credencialRechazadaEn),
  escucha,
  // [SUPUESTO] S-120 · el último evento ya está en `ultimo_latido`: el latido
  // (C4, 15-L) toma la señal de la escucha, que incluye cada evento recibido.
  ultimoEvento: null,
  ultimoLatido: e.ultimoLatido === null ? null : new Date(e.ultimoLatido),
  ...(e.umbralDeLatido === null ? {} : { umbral: e.umbralDeLatido }),
});
