import type { ExecutionContext } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LÍMITES DEL INICIO DE SESIÓN · por cuenta y por origen (§2.7.5, S-50)
 *
 * Tres contadores sobre la misma ruta, cada uno por lo suyo:
 *
 *  · `default`, por la dirección que llama a la API (30/min en la ruta).
 *  · `acceso-cuenta`, por la CUENTA que se intenta: número de portero, código +
 *    usuario, o correo.
 *    Es el que no se esquiva rotando direcciones, y el que corta la fuerza
 *    bruta contra un portero concreto (5/min).
 *  · `acceso-origen`, por la dirección del NAVEGADOR que declara la consola.
 *    Detrás de la consola todas las peticiones salen de la misma IP, y el
 *    contador por IP las sumaría a todas (10/min).
 *
 * Se hacen con limitadores CON NOMBRE y `skipIf`, como el de dispositivo
 * (D-28): un `@Throttle` en la ruta sólo cambia la cifra, no por qué se cuenta.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const LIMITADOR_ACCESO_CUENTA = 'acceso-cuenta';
export const LIMITADOR_ACCESO_ORIGEN = 'acceso-origen';
export const LIMITE_POR_CUENTA = 5;
export const LIMITE_POR_ORIGEN = 10;
export const LIMITE_POR_DIRECCION = 30;
export const CABECERA_ORIGEN = 'x-ncr-origen';
export const CABECERA_AGENTE = 'x-ncr-agente';

const CLAVE_LIMITE_DE_ACCESO = 'ncr:limite_de_acceso';
/** Marca la ruta a la que se aplican los dos limitadores con nombre. */
export const LimitadaComoAcceso = (): MethodDecorator => SetMetadata(CLAVE_LIMITE_DE_ACCESO, true);

const esRutaDeAcceso = (contexto: ExecutionContext): boolean =>
  Reflect.getMetadata(CLAVE_LIMITE_DE_ACCESO, contexto.getHandler()) === true;

const cadena = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max).toLowerCase() : null;

/** La cuenta que se intenta, normalizada como la normaliza el caso de uso. */
export const cuentaIntentada = (cuerpo: unknown): string => {
  if (typeof cuerpo !== 'object' || cuerpo === null) return 'sin-cuerpo';
  const c = cuerpo as Record<string, unknown>;
  const correo = cadena(c['correo'], 254);
  if (correo !== null) return `correo:${correo}`;
  const usuario = cadena(c['usuario'], 32) ?? '';
  // H3 (15-L) · sin NIT: la cuenta es el número de portero, o código + usuario.
  const codigo = cadena(c['codigo'], 8);
  if (codigo !== null) return `codigo:${codigo.replace(/\s/g, '')}|${usuario}`;
  return `portero:${usuario}`;
};

export const origenDeclarado = (cabeceras: Record<string, unknown>): string | null =>
  cadena(cabeceras[CABECERA_ORIGEN], 100);

/**
 * H5 · H6 (15-L) · la cuota por cuenta se cuenta por (IP, cuenta), NUNCA por
 * cuenta a secas: si no, cualquiera bloquearía a un portero tecleando mal su
 * número desde otro equipo. Y la IP es `req.ip`, que el `trust proxy` acotado
 * ya resolvió a la del navegador: la cabecera declarada por la consola deja de
 * hacer falta (y de poder falsificarse).
 *
 * `factor` multiplica los topes: en modo pruebas suben, no se apagan (§2.7.5).
 */
export const limitadoresDeAcceso = (
  factor: () => Promise<number> = async () => 1,
): ThrottlerOptions[] => [
  {
    name: LIMITADOR_ACCESO_CUENTA,
    ttl: 60_000,
    limit: async () => LIMITE_POR_CUENTA * (await factor()),
    skipIf: (contexto) => !esRutaDeAcceso(contexto),
    getTracker: (peticion) => {
      const p = peticion as { body?: unknown; ip?: string };
      return `${p.ip ?? 'desconocido'}|${cuentaIntentada(p.body)}`;
    },
  },
  {
    name: LIMITADOR_ACCESO_ORIGEN,
    ttl: 60_000,
    limit: async () => LIMITE_POR_ORIGEN * (await factor()),
    skipIf: (contexto) => !esRutaDeAcceso(contexto),
    getTracker: (peticion) => `origen:${(peticion as { ip?: string }).ip ?? 'desconocido'}`,
  },
];
