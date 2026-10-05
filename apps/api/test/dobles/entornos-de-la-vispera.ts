import { expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 15-S1 · A2 · lo que comparten las pruebas de la víspera: un repositorio de
 * mentira con sus .env, unos .env completos «de sitio» con valores que NUNCA
 * deben salir por pantalla, y la comprobación de que no salen.
 */
export const SECRETO = 'secreto-simulado-que-no-debe-salir-0123456789abcdef';
export const IP_DE_LA_RED = '203.0.113.23';

const temporales: string[] = [];
/** Borra los repositorios de mentira: en el `afterEach` de quien los use. */
export const borrarRepositorios = (): void => {
  for (const d of temporales.splice(0)) rmSync(d, { recursive: true, force: true });
};

/** Un repositorio de mentira con el .env de la API y los de la consola que se pidan. */
export const repositorio = (api: string | null, consola: Readonly<Record<string, string>>) => {
  const raiz = mkdtempSync(join(tmpdir(), 'vispera-'));
  temporales.push(raiz);
  mkdirSync(join(raiz, 'apps/api'), { recursive: true });
  mkdirSync(join(raiz, 'apps/web'), { recursive: true });
  if (api !== null) writeFileSync(join(raiz, 'apps/api/.env'), api);
  for (const [fichero, contenido] of Object.entries(consola))
    writeFileSync(join(raiz, 'apps/web', fichero), contenido);
  return { raiz, rutaEnv: join(raiz, 'apps/api/.env') };
};

export const API_COMPLETA = [
  'GUARDIA_AUDIO_TRANSPORTE=websocket',
  'GUARDIA_VIGENCIA_EN_COLA_S=300',
  'EVENTOS_HISTORICOS_LOTE=500',
  'EVENTOS_HISTORICOS_POR_SEGUNDO=500',
  'PGBOSS_POOL_MAX=2',
  'SUPABASE_POOLER_MAX_CLIENTES=15',
  `WEB_PUSH_VAPID_PUBLICA="${SECRETO}"`,
  `WEB_PUSH_VAPID_PRIVADA=${SECRETO}`,
  'WEB_PUSH_SUJETO=mailto:guardia@ejemplo.invalid',
  'WEB_PUSH_SERVICIOS_PERMITIDOS=',
  'WEB_PUSH_TTL_SEGUNDOS=',
  'WEBRTC_STUN_URLS=',
  `WEBRTC_TURN_URLS=turn:${IP_DE_LA_RED}:3478`,
  `WEBRTC_TURN_SECRETO=${SECRETO}`,
  'WEBRTC_TURN_TTL_SEGUNDOS=',
  'API_IP_FIRMA_SECRETO=',
].join('\n');
export const CONSOLA_DE_SITIO = [
  'API_ORIGEN_PUBLICO=',
  'CONSOLA_CABECERA_IP_DE_CONFIANZA=',
  'CONSOLA_IP_FIRMA_SECRETO=',
  'RECUPERACION_POR_CORREO=desactivada',
].join('\n');

export const sinValoresNiIps = (lineas: readonly string[]) => {
  const todo = lineas.join('\n');
  expect(todo).not.toContain(SECRETO);
  expect(todo).not.toContain(IP_DE_LA_RED);
  expect(todo).not.toContain('ejemplo.invalid');
  // La única dirección que puede salir es el bucle local, que es la instrucción.
  const ips = todo.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? [];
  expect(ips.filter((ip) => ip !== '127.0.0.1')).toEqual([]);
};
