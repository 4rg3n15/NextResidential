import { codigoCorto } from './codigo-corto';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TRES AJUSTES DE PLATAFORMA · ETAPA 15-I (D1, D5 a, D7)
 *
 * Los cambia SÓLO el superadministrador —la base lo repite con
 * `tg_copropiedad_ajustes_de_plataforma` (0038) frente a la REST—, y cada uno
 * lo es por un motivo distinto:
 *
 *  · CÓDIGO CORTO (D1): es la llave pública con la que se entra. Si el
 *    administrador pudiera cambiarlo, dejaría fuera de un golpe a todos los
 *    residentes y porteros del conjunto.
 *  · TELÉFONO DE PORTERÍA (D7): es a donde llama el botón de la app. Un número
 *    equivocado es una emergencia que no llega.
 *  · TOPE DE VEHÍCULOS PROPIOS (D5 a): decide cuántos vehículos entran sin
 *    aprobación de nadie. Subirlo es ampliar el acceso automático.
 *
 * Fichero aparte de `configuracion.ts` por §2.3 (SRP y 300 líneas): aquí vive
 * la verdad de negocio de estos tres; el catálogo sólo los enumera.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export const TOPE_VEHICULOS_MINIMO = 0;
export const TOPE_VEHICULOS_MAXIMO = 20;
/** D5 a · el valor por omisión que fija la migración 0038. */
export const TOPE_VEHICULOS_POR_OMISION = 2;
/** D5 c · el único modo de aprobación de terceros activo hoy (ADR-027). */
export const APROBACION_DE_TERCEROS = 'automatica' as const;

/** Quita lo que la gente escribe al dictar un número: espacios, guiones, paréntesis, puntos. */
export const normalizarTelefono = (valor: string): string => valor.replace(/[\s().-]/g, '');

const FORMATO_TELEFONO = /^\+?[0-9]{7,15}$/;

/**
 * `[SUPUESTO]` S-58 · la consola acepta «código o NIT» en UN campo (D1). Un
 * código de 5 a 8 cifras sin letras sería indistinguible de un NIT y la consola
 * lo mandaría como NIT: se rechaza al asignarlo, con el remedio en el mensaje.
 */
export const pareceUnNit = (codigo: string): boolean => /^[0-9]{5,8}$/.test(codigo);

export const validarCodigoCorto = (valor: string | number): string | null => {
  if (typeof valor !== 'string') return 'se esperaba texto';
  const c = codigoCorto(valor);
  if (!c.ok) return c.error;
  return pareceUnNit(c.valor)
    ? 'un código de 5 o más cifras sin letras se confunde con un NIT: añada al menos una letra'
    : null;
};

/** Vacío = borrar el teléfono (la app dirá que no está registrado, en vez de fallar). */
export const validarTelefonoPorteria = (valor: string | number): string | null => {
  if (typeof valor !== 'string') return 'se esperaba texto';
  const limpio = normalizarTelefono(valor);
  if (limpio.length === 0) return null;
  return FORMATO_TELEFONO.test(limpio)
    ? null
    : 'un teléfono tiene de 7 a 15 cifras, con el prefijo «+» opcional';
};

export const validarTopeVehiculos = (valor: string | number): string | null =>
  typeof valor === 'number' &&
  Number.isInteger(valor) &&
  valor >= TOPE_VEHICULOS_MINIMO &&
  valor <= TOPE_VEHICULOS_MAXIMO
    ? null
    : `debe ser un entero entre ${String(TOPE_VEHICULOS_MINIMO)} y ${String(TOPE_VEHICULOS_MAXIMO)}`;

/** Lo que se guarda: el código normalizado, el teléfono limpio o `null`. */
export const codigoCortoEfectivo = (valor: string): string => {
  const c = codigoCorto(valor);
  return c.ok ? c.valor : valor;
};
export const telefonoEfectivo = (valor: string): string | null => {
  const limpio = normalizarTelefono(valor);
  return limpio.length === 0 ? null : limpio;
};
