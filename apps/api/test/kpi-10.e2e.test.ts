import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { USUARIO_R1 } from './dobles/directorio-del-residente';

/**
 * KPI-10 · «Un residente crea una autorización en menos de 60 segundos de
 * extremo a extremo». MEDIDO, no estimado.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ MIDE ESTO, Y QUÉ NO PUEDE MEDIR
 *
 * Los 60 segundos son de una PERSONA haciendo algo, y una persona no cabe en
 * una suite. Lo que sí cabe, y es lo único que el sistema controla, es **su
 * parte**: cuánto tarda el conjunto en aceptar la visita desde que el residente
 * pulsa el botón. Todo lo demás —abrir la app, escribir el nombre, elegir las
 * fechas, revisar— es tiempo de la persona y de la interfaz, y se cronometra
 * con un residente delante (el procedimiento está en la guía).
 *
 * La afirmación que esta prueba sostiene es por tanto acotada y verificable:
 * **el sistema consume como mucho `PRESUPUESTO_MS` de los 60 000**, así que el
 * resto queda para la persona. Si esto sube, KPI-10 se empieza a perder por
 * donde no se ve.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ p95 Y NO EL PROMEDIO
 *
 * El promedio esconde la cola, y la cola es lo que vive el residente que tuvo
 * mala suerte. Un promedio de 40 ms con un p95 de 4 s es un sistema que falla
 * el KPI para uno de cada veinte, y el promedio diría que va bien.
 *
 * Y el número que sale de aquí es un SUELO, no el tiempo real: el repositorio
 * es el doble en memoria, así que no incluye ni la red ni PostgreSQL. Sirve
 * para lo que sirve —detectar que la ruta se vuelva cara— y la medición contra
 * la base real es la del procedimiento de la guía, con la app de verdad.
 */
let app: INestApplication;
let firmante: Firmante;

/** Cuánto de los 60 000 ms puede gastar el sistema. Deja 57 s a la persona. */
const PRESUPUESTO_MS = 3_000;
const MUESTRAS = 30;

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
});
afterAll(async () => {
  await app?.close();
});

const percentil = (valores: readonly number[], p: number): number => {
  const ordenados = [...valores].sort((a, b) => a - b);
  const i = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return ordenados[i] ?? 0;
};

describe('KPI-10 · la parte del sistema, medida', () => {
  it(`crear una visita consume mucho menos que el presupuesto (p95 < ${PRESUPUESTO_MS} ms)`, async () => {
    const token = await tokenDe(firmante, {
      rol: 'residente',
      copropiedadId: COP_A,
      usuarioId: USUARIO_R1,
      aal: 'aal1',
    });

    const medidas: number[] = [];
    for (let i = 0; i < MUESTRAS; i += 1) {
      const cuerpo = {
        visitante: 'Visitante cronometrado',
        desde: new Date(Date.now() + 60_000).toISOString(),
        hasta: new Date(Date.now() + 3_600_000).toISOString(),
        acompanantes: ['Acompañante'],
        zonasPermitidas: [],
        observaciones: 'medición de KPI-10',
        // Clave distinta por muestra: con la misma, a partir de la segunda se
        // estaría midiendo el camino del reintento —que es más barato— y el
        // número saldría bonito midiendo otra cosa.
        claveDeIdempotencia: `kpi-10-muestra-${String(i).padStart(4, '0')}`,
      };
      const inicio = performance.now();
      const res = await request(app.getHttpServer())
        .post(`/copropiedades/${COP_A}/mi/autorizaciones`)
        .set('Authorization', `Bearer ${token}`)
        .send(cuerpo);
      medidas.push(performance.now() - inicio);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.creada).toBe(true);
    }

    const p50 = percentil(medidas, 50);
    const p95 = percentil(medidas, 95);
    const peor = Math.max(...medidas);
    // Sale por la salida de la suite a propósito: el número es el entregable,
    // no el verde. Un KPI que solo se afirma no se puede discutir.
    console.log(
      `KPI-10 · parte del sistema sobre ${MUESTRAS} creaciones: ` +
        `p50 ${p50.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · peor ${peor.toFixed(1)} ms · ` +
        `presupuesto ${PRESUPUESTO_MS} ms · queda para la persona ${(60_000 - p95) / 1000} s`,
    );

    expect(p95).toBeLessThan(PRESUPUESTO_MS);
  });

  it('el reintento idempotente tampoco se sale del presupuesto', async () => {
    // Es el camino del modo sin conexión: cuando vuelve la red, la bandeja
    // reenvía. Si este fuera caro, el residente vería la app pensando justo
    // cuando acaba de recuperar cobertura.
    const token = await tokenDe(firmante, {
      rol: 'residente',
      copropiedadId: COP_A,
      usuarioId: USUARIO_R1,
      aal: 'aal1',
    });
    const cuerpo = {
      visitante: 'Visitante reenviado',
      desde: new Date(Date.now() + 60_000).toISOString(),
      hasta: new Date(Date.now() + 3_600_000).toISOString(),
      acompanantes: [],
      zonasPermitidas: [],
      observaciones: null,
      claveDeIdempotencia: 'kpi-10-reintento-0001',
    };
    const enviar = () =>
      request(app.getHttpServer())
        .post(`/copropiedades/${COP_A}/mi/autorizaciones`)
        .set('Authorization', `Bearer ${token}`)
        .send(cuerpo);

    await enviar();
    const medidas: number[] = [];
    for (let i = 0; i < MUESTRAS; i += 1) {
      const inicio = performance.now();
      const res = await enviar();
      medidas.push(performance.now() - inicio);
      expect(res.body.repetida).toBe(true);
    }
    const p95 = percentil(medidas, 95);
    console.log(`KPI-10 · reintento idempotente: p95 ${p95.toFixed(1)} ms`);
    expect(p95).toBeLessThan(PRESUPUESTO_MS);
  });
});
