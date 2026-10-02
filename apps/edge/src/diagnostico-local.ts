/**
 * 15-Q · Q7 · ¿EL GATEWAY EN MARCHA CONTESTA? — el paso de `pnpm sitio:edge`
 * que habla con el proceso, no con su configuración.
 *
 * Pide `GET /estado` en la interfaz configurada, FIRMADO con el secreto local
 * (marca, nonce y HMAC: la misma protección que cualquier entrada local, Q5).
 * Así comprueba tres cosas de una vez: que el proceso escucha donde dice el
 * `.env`, que el secreto local del `.env` es el del proceso, y en qué modo
 * está el enlace ahora mismo. Sin datos personales: modo, versión y pendientes.
 */
import { randomBytes } from 'node:crypto';
import type { ConfiguracionDeSitio } from './configuracion/esquema-de-sitio';
import {
  CABECERA_FIRMA,
  CABECERA_MARCA,
  CABECERA_NONCE,
  firmaLocal,
} from './infraestructura/http/proteccion-local';

export interface VeredictoLocal {
  readonly estado: 'OK' | 'AVISO' | 'FALLO';
  readonly detalle: string;
}

export const gatewayEnMarcha = async (
  config: ConfiguracionDeSitio,
  transporte: typeof fetch,
  ahora: () => Date,
): Promise<VeredictoLocal> => {
  const ruta = '/estado';
  const marca = String(Math.floor(ahora().getTime() / 1000));
  const nonce = randomBytes(12).toString('hex');
  const host = config.EDGE_ESCUCHA_HOST.includes(':')
    ? `[${config.EDGE_ESCUCHA_HOST}]`
    : config.EDGE_ESCUCHA_HOST;
  let r: Response;
  try {
    r = await transporte(`http://${host}:${String(config.EDGE_ESCUCHA_PUERTO)}${ruta}`, {
      headers: {
        [CABECERA_MARCA]: marca,
        [CABECERA_NONCE]: nonce,
        [CABECERA_FIRMA]: firmaLocal(config.EDGE_LOCAL_SECRETO, marca, nonce, 'GET', ruta, ''),
      },
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    return {
      estado: 'AVISO',
      detalle: 'no contesta: el servicio no está en marcha (o escucha en otra interfaz)',
    };
  }
  if (r.status === 401) {
    return {
      estado: 'FALLO',
      detalle: 'rechaza la firma: EDGE_LOCAL_SECRETO no es el del proceso en marcha',
    };
  }
  if (!r.ok) return { estado: 'FALLO', detalle: `responde ${String(r.status)}` };
  const e = (await r.json()) as { modo?: unknown; versionDeReglas?: unknown; pendientes?: unknown };
  return {
    estado: 'OK',
    detalle: `modo ${String(e.modo)} · reglas v${String(e.versionDeReglas ?? '—')} · ${String(e.pendientes ?? 0)} pendientes`,
  };
};
