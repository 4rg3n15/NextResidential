import type { ExecutionContext } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';
import { normalizarCodigoDeOcupante } from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LÍMITES DE «CREAR CUENTA» · RONDA 15-W (§7 del encargo)
 *
 * El limitador corre ANTES de la autenticación —aquí no la hay—, así que mira
 * lo único que hay: la dirección y el cuerpo. Tres capas:
 *
 *  · `default` en la ruta: 10 cada 10 min por IP.
 *  · `registro`, con nombre y `skipIf` como los de acceso: 5 cada 15 min por
 *    (IP, prefijo del código). Frena a quien prueba códigos de UN conjunto sin
 *    gastar el cupo de otros.
 *  · En la base, dentro del caso de uso: 30 códigos fallidos en una hora en una
 *    copropiedad suspenden su registro una hora (la bitácora los cuenta, como
 *    el límite de vinculación de ADR-025). Es lo que no se esquiva rotando IP.
 *
 * `factor` multiplica los topes en modo pruebas: suben, nunca se apagan.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const LIMITADOR_REGISTRO = 'registro';
export const LIMITE_DE_REGISTRO_POR_IP = 10;
export const VENTANA_DE_REGISTRO_POR_IP_MS = 10 * 60_000;
export const LIMITE_DE_REGISTRO_POR_PREFIJO = 5;
export const VENTANA_DE_REGISTRO_POR_PREFIJO_MS = 15 * 60_000;

const CLAVE_LIMITE_DE_REGISTRO = 'ncr:limite_de_registro';
export const LimitadaComoRegistro = (): MethodDecorator =>
  SetMetadata(CLAVE_LIMITE_DE_REGISTRO, true);

const esRutaDeRegistro = (contexto: ExecutionContext): boolean =>
  Reflect.getMetadata(CLAVE_LIMITE_DE_REGISTRO, contexto.getHandler()) === true;

/** El prefijo del código que se intenta, normalizado como lo normaliza el dominio. */
export const prefijoIntentado = (cuerpo: unknown): string => {
  if (typeof cuerpo !== 'object' || cuerpo === null) return 'sin-cuerpo';
  const bruto = (cuerpo as Record<string, unknown>)['codigoDeInvitacion'];
  if (typeof bruto !== 'string') return 'sin-codigo';
  const codigo = normalizarCodigoDeOcupante(bruto.slice(0, 40));
  return codigo.ok ? (codigo.valor.prefijo ?? 'sin-prefijo') : 'malformado';
};

export const limitadoresDeRegistro = (
  factor: () => Promise<number> = async () => 1,
): ThrottlerOptions[] => [
  {
    name: LIMITADOR_REGISTRO,
    ttl: VENTANA_DE_REGISTRO_POR_PREFIJO_MS,
    limit: async () => LIMITE_DE_REGISTRO_POR_PREFIJO * (await factor()),
    skipIf: (contexto) => !esRutaDeRegistro(contexto),
    getTracker: (peticion) => {
      const p = peticion as { body?: unknown; ip?: string };
      return `${p.ip ?? 'desconocido'}|${prefijoIntentado(p.body)}`;
    },
  },
];
