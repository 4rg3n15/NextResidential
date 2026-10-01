import type { SalidaAplanada } from '@ncr/providers';
import type { ContextoTenant, Rol } from '../../autenticacion';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P3 · LOS PUNTOS DE ACCESO DE UN EQUIPO
 *
 * Entidad interna del agregado Dispositivo (migración 0009, ampliada en la
 * 0048): una fila por puerta que el equipo abre. Las salidas DESCUBIERTAS son
 * las que el videoportero declara (`nucleo/salidas.ts` del paquete de
 * proveedores); el nombre lo edita el administrador y sobrevive a una nueva
 * lectura. La puerta que el equipo abre —`numeroDePuerta`— nunca cambia en una
 * fila: si el equipo deja de declararla, la fila se da de BAJA (RN-19) y una
 * reaparición es una fila nueva.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface PuntoDeAcceso {
  readonly id: string;
  readonly dispositivoId: string;
  readonly nombre: string;
  readonly numeroDePuerta: number;
  readonly modulo: string | null;
  readonly rutaEnElEquipo: string | null;
  readonly origen: 'descubierto' | 'manual';
  readonly descubiertoEn: Date | null;
}

export interface RepositorioDePuntos {
  /** Los ACTIVOS del equipo, por número de puerta. Lectura operativa. */
  listar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
  ): Promise<readonly PuntoDeAcceso[]>;
  /**
   * Deja los activos iguales a lo que el equipo declaró: alta de lo nuevo,
   * baja lógica de lo que ya no declara, y lo que sigue, intacto —con el
   * nombre que le haya puesto el administrador—. En una transacción.
   */
  sincronizar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
    salidas: readonly SalidaAplanada[],
    ahora: Date,
  ): Promise<readonly PuntoDeAcceso[]>;
  /** `null` si el punto no es de ese equipo, de esa copropiedad, o está inactivo. */
  renombrar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
    puntoId: string,
    nombre: string,
  ): Promise<PuntoDeAcceso | null>;
}
export const REPOSITORIO_DE_PUNTOS = Symbol.for('ncr.puerto.RepositorioDePuntos');

/** Quién administra las salidas de un equipo: el mismo que administra el equipo. */
export const ROLES_QUE_ADMINISTRAN_SALIDAS: readonly Rol[] = [
  'administrador',
  'superadministrador',
];

/** Quién las ve para abrirlas: quien acciona puertas (RN-08). El residente nunca. */
export const ROLES_QUE_OPERAN_SALIDAS: readonly Rol[] = [
  'portero',
  'operador_central',
  'administrador',
  'superadministrador',
];

export const LONGITUD_MAXIMA_DEL_NOMBRE = 80;

const NO_IMPRIMIBLES =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * El nombre que el operador va a leer junto al botón de abrir: sin controles
 * ni marcas de dirección (un `U+202E` haría que «Portón» se leyera al revés),
 * NFC, espacios colapsados, entre 1 y 80 caracteres. `null` si no vale.
 */
export const nombreDePunto = (crudo: unknown): string | null => {
  if (typeof crudo !== 'string') return null;
  const limpio = crudo.replace(NO_IMPRIMIBLES, '').normalize('NFC').replace(/\s+/g, ' ').trim();
  return limpio.length >= 1 && limpio.length <= LONGITUD_MAXIMA_DEL_NOMBRE ? limpio : null;
};
