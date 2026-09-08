import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';

/** Nombre del limitador. Se usa en el módulo y en el decorador de la ruta. */
export const LIMITADOR_DISPOSITIVO = 'dispositivo';

const dispositivoDe = (contexto: ExecutionContext): string | null => {
  const peticion = contexto.switchToHttp().getRequest<{ body?: unknown }>();
  const cuerpo = peticion.body;
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const dispositivoId = (cuerpo as Record<string, unknown>)['dispositivoId'];
  return typeof dispositivoId === 'string' && dispositivoId.length > 0 ? dispositivoId : null;
};

/**
 * Límite de peticiones **por dispositivo** — D-28, §2.7.5.
 *
 * §2.7.5 exige limitar «por IP y por identidad». En la ingesta la IP no es una
 * identidad útil: **todos los equipos del conjunto salen por el mismo enrutador**,
 * así que un límite por IP o bien es tan alto que no protege, o bien deja fuera
 * a las cámaras sanas en cuanto una se desboca. La identidad real del emisor es
 * el dispositivo que firma el evento.
 *
 * SE IMPLEMENTA COMO UN LIMITADOR CON NOMBRE, NO COMO UN GUARD PROPIO, y el
 * motivo lo descubrió la prueba de carga: un `@Throttle({ default: ... })` en la
 * ruta reconfigura el limitador `default` **para todos los guards**, incluido el
 * global, que sigue contando por IP. La medición se paró en seco en 120 de 200
 * eventos —exactamente el límite— con veinticinco cámaras distintas y una sola
 * IP de origen: el mismo defecto que este código dice evitar, dentro del propio
 * código que lo dice. Con dos limitadores con nombre, cada uno cuenta por lo
 * suyo: `default` por IP y `dispositivo` por equipo.
 *
 * `skipIf` lo acota a las peticiones que traen `dispositivoId`. Sin eso, el
 * limitador se aplicaría a TODA ruta y, al no encontrar dispositivo, impondría
 * un segundo tope por IP más estricto que el global en endpoints que nada tienen
 * que ver con el hardware.
 */
export const limitadorPorDispositivo = (limite: number): ThrottlerOptions => ({
  name: LIMITADOR_DISPOSITIVO,
  ttl: 60_000,
  limit: limite,
  skipIf: (contexto) => dispositivoDe(contexto) === null,
  getTracker: (_peticion, contexto) => `dispositivo:${dispositivoDe(contexto) ?? 'desconocido'}`,
});
