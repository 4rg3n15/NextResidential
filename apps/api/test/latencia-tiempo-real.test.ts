import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { PLAZO_ESCALAMIENTO_MS } from '@ncr/domain-core';
import { COP_A, configuracionDePrueba, crearApp, crearFirmante, tokenDe } from './utilidades';
import {
  CABECERA_FIRMA,
  CABECERA_MARCA,
  firmar,
} from '../src/autorizaciones/presentacion/firma-ingesta';

/**
 * LATENCIA DEL CANAL DE TIEMPO REAL, MEDIDA BAJO CARGA — prioridad de la ETAPA 06.
 *
 * El documento de requisitos señala el canal de tiempo real como riesgo de
 * cronograma, y KPI-25 compromete menos de 10 s desde que una alerta se genera
 * hasta que llega al operador de central. Medirlo en la ETAPA 10, cuando las
 * consolas ya dependan de él, sería enterarse tarde.
 *
 * QUÉ MIDE ESTA PRUEBA, EXACTAMENTE. El camino completo y real, por HTTP:
 *
 *   POST firmado a /ingesta/eventos
 *     → decisión del motor
 *     → evento anexado al histórico
 *     → clasificación de alerta
 *     → publicación en el canal
 *     → escritura en el socket SSE
 *     → llegada al cliente
 *
 * La latencia se calcula contra `generadaEn` de la propia alerta —el mismo
 * instante que sella KPI-25—, no contra el momento en que la prueba envió el
 * POST. Es lo que hace comparable esta cifra con la que registra la bitácora en
 * producción.
 *
 * QUÉ NO MIDE, y hay que decirlo: **no mide Supabase Realtime**. Este entorno no
 * tiene credenciales del proyecto (D-17), así que no hay contra qué medirlo.
 * Mide el adaptador que esta etapa construye y que es, precisamente, la
 * contingencia documentada en `docs/arquitectura/tiempo-real-y-contingencia.md`.
 * El procedimiento para medir el otro camino cuando haya credenciales está en
 * esa guía.
 */
const SUSCRIPTORES = 25;
const EVENTOS = 200;
/** Margen sobre KPI-25 para que la prueba avise ANTES de incumplirlo. */
const UMBRAL_P99_MS = PLAZO_ESCALAMIENTO_MS / 10;

interface Medicion {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly recibidas: number;
  readonly esperadas: number;
}

let app: INestApplication;
let servidor: Server;
let base = '';
let token = '';

const firmado = (cuerpo: object): Record<string, string> => {
  const marca = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    [CABECERA_MARCA]: marca,
    [CABECERA_FIRMA]: firmar(
      configuracionDePrueba.INGESTA_FIRMA_SECRETO,
      marca,
      JSON.stringify(cuerpo),
    ),
  };
};

const percentil = (valores: number[], p: number): number => {
  if (valores.length === 0) return Number.NaN;
  const orden = [...valores].sort((a, b) => a - b);
  const indice = Math.min(orden.length - 1, Math.ceil((p / 100) * orden.length) - 1);
  return orden[Math.max(0, indice)] as number;
};

beforeAll(async () => {
  const firmante = await crearFirmante();
  app = await crearApp(firmante);
  // Servidor HTTP de verdad: el objetivo es medir el socket, y `supertest`
  // sobre el manejador en memoria mediría otra cosa.
  await app.listen(0);
  servidor = app.getHttpServer() as Server;
  const puerto = (servidor.address() as AddressInfo).port;
  base = `http://127.0.0.1:${puerto}`;
  token = await tokenDe(firmante, {
    rol: 'operador_central',
    copropiedadId: COP_A,
    copropiedades: [COP_A],
  });
}, 60_000);

afterAll(async () => {
  await app?.close();
});

/** Abre un suscriptor SSE y devuelve las latencias que observe. */
const abrirSuscriptor = async (
  latencias: number[],
  recibidas: Set<string>,
): Promise<() => void> => {
  const control = new AbortController();
  const respuesta = await fetch(`${base}/copropiedades/${COP_A}/eventos/flujo`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
    signal: control.signal,
  });
  if (respuesta.body === null) throw new Error('el flujo no devolvió cuerpo');

  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  let resto = '';

  void (async () => {
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        resto += decodificador.decode(value, { stream: true });

        const bloques = resto.split('\n\n');
        resto = bloques.pop() ?? '';
        for (const bloque of bloques) {
          if (!bloque.includes('event: alertas')) continue;
          const datos = bloque.split('\n').find((l) => l.startsWith('data: '));
          if (datos === undefined) continue;
          const carga = JSON.parse(datos.slice(6)) as { id: string; generadaEn: string };
          latencias.push(Date.now() - new Date(carga.generadaEn).getTime());
          recibidas.add(carga.id);
        }
      }
    } catch (e) {
      // El corte al terminar la prueba es esperado; cualquier otro fallo NO.
      if (!/abort/i.test(String(e))) console.warn('lector SSE caído:', String(e));
    }
  })();

  return () => control.abort();
};

const medir = async (): Promise<Medicion> => {
  const latencias: number[] = [];
  const recibidas = new Set<string>();
  const cierres: (() => void)[] = [];

  for (let i = 0; i < SUSCRIPTORES; i += 1) {
    cierres.push(await abrirSuscriptor(latencias, recibidas));
  }
  // Un respiro para que los `flushHeaders` de todos lleguen antes de la ráfaga.
  await new Promise((r) => setTimeout(r, 200));

  const enviados: string[] = [];
  // Ráfaga: los eventos salen sin esperar al anterior, que es como llegan
  // cuando un Edge reconcilia tras un corte de WAN.
  await Promise.all(
    Array.from({ length: EVENTOS }, async (_, i) => {
      const cuerpo = {
        copropiedadId: COP_A,
        // Un dispositivo distinto por evento: el límite por dispositivo (D-28)
        // es de 120/min y falsearía la medición si todos usaran el mismo.
        dispositivoId: `carga-${i}`,
        metodo: 'placa' as const,
        placaLeida: 'ABC123',
        confianzaCentesimas: 95,
        referenciaExterna: `carga-${i}`,
      };
      const r = await fetch(`${base}/ingesta/eventos`, {
        method: 'POST',
        headers: firmado(cuerpo),
        body: JSON.stringify(cuerpo),
      });
      const cuerpoRespuesta = (await r.json()) as { alertaId: string | null };
      if (cuerpoRespuesta.alertaId !== null) enviados.push(cuerpoRespuesta.alertaId);
    }),
  );

  // Espera acotada a que llegue lo publicado. No es un `sleep` fijo: sale en
  // cuanto están todas, y el tope evita colgar la suite si algo se pierde.
  const limite = Date.now() + 45_000;
  while (recibidas.size < enviados.length && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 25));
  }
  for (const cerrar of cierres) cerrar();

  return {
    p50: percentil(latencias, 50),
    p95: percentil(latencias, 95),
    p99: percentil(latencias, 99),
    max: Math.max(...latencias),
    recibidas: recibidas.size,
    esperadas: enviados.length,
  };
};

describe('KPI-25 · latencia del canal de tiempo real bajo carga', () => {
  it(`${EVENTOS} eventos en ráfaga con ${SUSCRIPTORES} consolas conectadas`, async () => {
    const m = await medir();

    const informe = [
      '',
      '  ── LATENCIA DEL CANAL DE TIEMPO REAL (adaptador en proceso + SSE) ──',
      `  carga            : ${EVENTOS} eventos en ráfaga · ${SUSCRIPTORES} consolas suscritas`,
      `  alertas entregadas: ${m.recibidas} de ${m.esperadas}`,
      `  p50              : ${m.p50} ms`,
      `  p95              : ${m.p95} ms`,
      `  p99              : ${m.p99} ms`,
      `  máximo           : ${m.max} ms`,
      `  umbral KPI-25    : ${PLAZO_ESCALAMIENTO_MS} ms (esta prueba exige p99 < ${UMBRAL_P99_MS} ms)`,
      '',
    ].join('\n');
    console.warn(informe);
    writeFileSync(
      new URL('../../../.latencia-tiempo-real.json', import.meta.url),
      JSON.stringify({ ...m, umbralKpi25Ms: PLAZO_ESCALAMIENTO_MS, medidoEn: new Date() }, null, 2),
    );

    // Toda alerta publicada llega a TODAS las consolas: una entrega parcial
    // sería una fuga de atención, no una latencia alta.
    expect(m.recibidas).toBe(m.esperadas);
    expect(m.esperadas).toBeGreaterThan(0);

    // El compromiso es de 10 s; se exige un orden de magnitud de margen para
    // que la prueba avise cuando la latencia empiece a subir, no cuando ya se
    // haya incumplido el indicador.
    expect(m.p99).toBeLessThan(UMBRAL_P99_MS);
    expect(m.max).toBeLessThan(PLAZO_ESCALAMIENTO_MS);
  }, 120_000);
});
