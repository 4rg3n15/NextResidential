import { construirClaveIdempotencia } from '@ncr/domain-core';
import { FlujoEnVivo, equiposSimulados } from '@ncr/providers';
// Para las pruebas de `aplicacion/`, que no importan providers como valor (O2).
export { hechoDeAccesoDe } from '@ncr/providers';
import { hashDelContenido } from '../src/aplicacion/descarga-de-reglas';
import type { InstantaneaDeReglas } from '../src/aplicacion/instantanea-de-reglas';

/**
 * 15-Q · EL BANCO DEL EDGE EN SITIO, para las pruebas del Edge y la DoD.
 *
 *  · los EQUIPOS son los simulados de `packages/providers` (un `fetch` que se
 *    comporta como el aparato), uno por puerto: la cámara LPR y la terminal;
 *  · la NUBE de este fichero es un doble con el MISMO protocolo que la API
 *    (instantánea con «sin cambios», bandeja con duplicados) y un interruptor
 *    de WAN. La DoD de verdad (`apps/api/test/edge-en-sitio-pg.e2e.test.ts`)
 *    cambia este doble por la API real contra PostgreSQL.
 *
 * Sin una IP real: todo es `127.0.0.1` y nombres `.invalid` (RN-21).
 */
export const COP = '10000000-0000-4000-8000-000000000001';
export const VIVIENDA = '30000000-0000-4000-8000-000000000001';
export const PERSONA = '40000000-0000-4000-8000-000000000001';
export const CAMARA = '90000000-0000-4000-8000-000000000001';
export const TERMINAL = '90000000-0000-4000-8000-000000000002';
export const PLANTILLA = '60000000-0000-4000-8000-000000000001';
export const HOST_CAMARA = 'camara-edge.simulado.invalid';
export const HOST_TERMINAL = 'terminal-edge.simulado.invalid';
export const SECRETO_CAMARA = 'secreto-de-la-camara-hacia-el-edge-sin-valor';
export const SECRETO_LOCAL = 'secreto-local-del-edge-para-pruebas-sin-valor';
const USUARIO = 'servicio';
const CLAVE = 'clave-simulada';

export const instantaneaDePrueba = (version = 1, generadaEn = new Date().toISOString()) => {
  const sinHash: Omit<InstantaneaDeReglas, 'hash'> = {
    copropiedadId: COP,
    version,
    generadaEn,
    autorizaciones: [
      {
        id: '70000000-0000-4000-8000-000000000001',
        viviendaId: VIVIENDA,
        personaId: PERSONA,
        desde: '2026-01-01T00:00:00.000Z',
        hasta: '2036-01-01T00:00:00.000Z',
        estado: 'vigente',
        zonasPermitidas: [],
        acompanantes: [],
        maximoAcompanantes: 5,
        patron: null,
        placa: 'ABC123',
      },
    ],
    personasEnListaNegra: [],
    placasEnListaNegra: ['MAL666'],
    viviendasActivas: [VIVIENDA],
    vehiculos: [],
    zonas: [],
    personasConConsentimiento: [PERSONA],
    plantillas: [
      { plantillaId: PLANTILLA, personaId: PERSONA, reconocibleHasta: '2036-01-01T00:00:00.000Z' },
    ],
    umbralDeConfianza: 0.8,
  };
  return {
    ...sinHash,
    hash: hashDelContenido(sinHash as InstantaneaDeReglas),
  } as InstantaneaDeReglas;
};

const respuesta = (status: number, cuerpo: unknown): Response =>
  ({ ok: status < 400, status, json: async () => cuerpo }) as Response;

/** La nube de mentira: el protocolo de la API, un interruptor de WAN y memoria de lo recibido. */
export class NubeDePrueba {
  wan = true;
  instantanea = instantaneaDePrueba();
  readonly recibidos: Record<string, unknown>[] = [];
  private readonly claves = new Set<string>();

  readonly transporte = (async (entrada: string | URL, init?: RequestInit): Promise<Response> => {
    if (!this.wan) throw new TypeError('fetch failed: sin WAN');
    const url = new URL(String(entrada));
    if (url.pathname === '/ready') return respuesta(200, { listo: true });
    if (url.pathname.endsWith('/reglas/instantanea')) {
      const desde = Number(url.searchParams.get('desde') ?? '0');
      return desde >= this.instantanea.version
        ? respuesta(200, {
            copropiedadId: COP,
            version: this.instantanea.version,
            sinCambios: true,
            generadaEn: new Date().toISOString(),
          })
        : respuesta(200, this.instantanea);
    }
    if (url.pathname.endsWith('/edge/reconciliacion')) {
      const { eventos } = JSON.parse(String(init?.body)) as { eventos: Record<string, unknown>[] };
      const resultados = eventos.map((e) => {
        const clave = construirClaveIdempotencia({
          copropiedadId: String(e['copropiedadId']),
          dispositivoId: String(e['dispositivoId']),
          origen: e['metodo'] as 'placa',
          referenciaExterna: String(e['referenciaExterna']),
        });
        const valor = clave.ok ? clave.valor : '';
        const duplicado = this.claves.has(valor);
        this.claves.add(valor);
        this.recibidos.push(e);
        return { claveIdempotencia: valor, aceptado: true, duplicado };
      });
      return respuesta(202, { aceptado: true, resultados });
    }
    return respuesta(404, {});
  }) as unknown as typeof fetch;

  /** Cuántos accesos DISTINTOS tiene la nube: «exactamente una vez» se mide aquí. */
  get distintos(): number {
    return this.claves.size;
  }
}

/** Los equipos simulados, uno por puerto en 127.0.0.1. */
export const equiposDeSitio = () => {
  const flujoDeLaTerminal = new FlujoEnVivo();
  const simulados = equiposSimulados({
    [HOST_CAMARA]: { familia: 'camara', usuario: USUARIO, clave: CLAVE },
    [HOST_TERMINAL]: {
      familia: 'terminal',
      usuario: USUARIO,
      clave: CLAVE,
      verificacionRemota: true,
      enVivo: flujoDeLaTerminal,
    },
  });
  const porPuerto: Readonly<Record<string, string>> = {
    '8001': HOST_CAMARA,
    '8002': HOST_TERMINAL,
  };
  const peticion = (async (entrada: string | URL, init?: RequestInit) => {
    const url = new URL(String(entrada));
    url.hostname = porPuerto[url.port] ?? url.hostname;
    return simulados(url, init);
  }) as typeof fetch;
  return { peticion, flujoDeLaTerminal };
};

/** El `.env` del Edge del banco. Los valores son de mentira; los nombres, los de verdad. */
export const entornoDeSitio = (cambios: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  EDGE_GATEWAY_ID: 'ed000000-0000-4000-8000-0000000000e1',
  EDGE_SERVICE_USER_ID: '00000000-0000-4000-8000-000000000003',
  EDGE_COPROPIEDAD_ID: COP,
  NEXT_CONTROL_API_URL: 'http://nube.invalid',
  EDGE_INGESTA_SECRETO: 'c'.repeat(64),
  SQLITE_PATH: ':memory:',
  SONDAS_PARA_CAER: '1',
  SONDAS_PARA_VOLVER: '1',
  RECONCILIACION_BACKOFF_MS: '1',
  EDGE_ESCUCHA_HOST: '127.0.0.1',
  EDGE_LOCAL_SECRETO: SECRETO_LOCAL,
  EDGE_EQUIPOS: JSON.stringify([
    {
      dispositivoId: CAMARA,
      tipo: 'camara_lpr',
      host: '127.0.0.1',
      puerto: 8001,
      usuario: USUARIO,
      clave: CLAVE,
      secretoAlarmServer: SECRETO_CAMARA,
    },
    {
      dispositivoId: TERMINAL,
      tipo: 'terminal_facial',
      host: '127.0.0.1',
      puerto: 8002,
      usuario: USUARIO,
      clave: CLAVE,
    },
  ]),
  ...cambios,
});
