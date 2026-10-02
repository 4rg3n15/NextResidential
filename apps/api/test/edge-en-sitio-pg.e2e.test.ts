import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
// `utilidades` PRIMERO: carga `AppModule` en su orden (ciclo eventos ↔ autorizaciones).
import { COP_A, crearApp, crearFirmante, direccionDe, tokenDe } from './utilidades';
import { aperturasFisicasPor, sobreDeLectura } from '@ncr/providers';
import { URL_BASE, exigirBase } from './base-exigida';
import { cargarConfiguracionDeSitio } from '../../edge/src/configuracion/esquema-de-sitio';
import { componerEdge } from '../../edge/src/composicion';
import type { EdgeCompuesto } from '../../edge/src/composicion';
import {
  HOST_CAMARA,
  SECRETO_CAMARA,
  entornoDeSitio,
  equiposDeSitio,
} from '../../edge/test/banco-de-sitio';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA DEFINICIÓN DE TERMINADO DE LA ETAPA 12, AHORA REAL · 15-Q (Q8)
 *
 * «30 minutos sin WAN con 20 accesos resueltos localmente; al reconectar, los 20
 *  aparecen en la nube exactamente una vez en menos de 5 minutos.»
 *
 * Lo que es de verdad aquí: la API con PostgreSQL, la credencial del Edge
 * emitida por la API, la instantánea que la API publica, el Edge entero
 * (`componerEdge`, el mismo que arranca `main.ts`), el receptor Alarm Server
 * local por HTTP, la cámara simulada de `providers` que ABRE su barrera, y la
 * reconciliación contra la ruta acreditada. Lo único fabricado es el TIEMPO del
 * corte (los tics llevan instantes de media hora) y el WAN, que es un
 * interruptor en el `fetch` del Edge hacia la nube.
 *
 * «Exactamente una vez» se prueba con lo peor que puede pasar: la PRIMERA
 * respuesta de la reconciliación se pierde (la nube escribió, el Edge no se
 * enteró) y el Edge reenvía. La base tiene que seguir con 20, no con 40.
 *
 * El procedimiento para repetirlo en sitio, cortando el WAN de verdad, está en
 * `docs/guias/DESPLIEGUE_EDGE.md` §9.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CAMARA = '90000000-0000-4000-8000-000000000001';
const CORRIDA = randomBytes(3).toString('hex').toUpperCase();
const PLACAS = ['PCH2145', 'GBA7890', 'ABC1234', 'CONC001', 'ABC9999', 'XYZ0000', `NO${CORRIDA}`];
const MINUTO = 60_000;
const ABIERTAS = 15;
const T0 = Date.now();

let pool: Pool | undefined;
let app: INestApplication | undefined;
let edge: EdgeCompuesto;
let receptor: Server;
let disponible = false;
let wan = true;
let perderLaPrimeraRespuesta = false;
const claves: string[] = [];

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 3 });
  const firmante = await crearFirmante();
  app = await crearApp(firmante, undefined, {
    PROVEEDOR_DE_EQUIPOS: 'simulado',
    CARGADOR_DE_CONTEXTO: 'postgres',
    PERSISTENCIA_DE_EVENTOS: 'postgres',
    DATABASE_URL: URL_BASE,
    DATABASE_POOLER_URL: URL_BASE,
  });
  const alta = await request(app.getHttpServer())
    .post(`/copropiedades/${COP_A}/edge-gateways`)
    .set(
      'Authorization',
      `Bearer ${await tokenDe(firmante, { rol: 'superadministrador', copropiedadId: null })}`,
    )
    .send({ nombre: `Edge DoD ${CORRIDA}` });

  // El WAN del Edge: un interruptor delante del `fetch` real hacia la API.
  const transporteDeNube = (async (entrada: string | URL, init?: RequestInit) => {
    if (!wan) throw new TypeError('fetch failed: WAN cortado');
    const respuesta = await fetch(entrada, init);
    if (perderLaPrimeraRespuesta && String(entrada).endsWith('/edge/reconciliacion')) {
      perderLaPrimeraRespuesta = false;
      throw new TypeError('la respuesta se perdió por el camino');
    }
    return respuesta;
  }) as typeof fetch;

  const config = cargarConfiguracionDeSitio(
    entornoDeSitio({
      EDGE_GATEWAY_ID: alta.body.edgeId,
      EDGE_COPROPIEDAD_ID: COP_A,
      EDGE_INGESTA_SECRETO: alta.body.secreto,
      NEXT_CONTROL_API_URL: direccionDe(app),
    }),
  );
  edge = componerEdge(config, {
    registrar: () => undefined,
    transporteDeNube,
    peticionAEquipos: equiposDeSitio().peticion,
  });
  receptor = createServer((req, res) => void edge.manejador(req, res));
  await new Promise<void>((listo) => receptor.listen(0, '127.0.0.1', listo));
  disponible = alta.status === 201;
}, 60_000);

afterAll(async () => {
  await new Promise((listo) => receptor?.close(listo));
  await app?.close();
  await pool?.end();
});

exigirBase('sin DATABASE_URL_PRUEBAS', () => disponible);

/** La cámara simulada publica al receptor del Edge, con el instante de su reloj. */
const publicar = async (placa: string, referencia: string, ocurridoEn: Date) => {
  const sobre = sobreDeLectura({ placa, referencia, ocurridoEn, confianza: 95 });
  const puerto = (receptor.address() as AddressInfo).port;
  const r = await fetch(`http://127.0.0.1:${String(puerto)}/alarm-server/${SECRETO_CAMARA}`, {
    method: 'POST',
    headers: { 'content-type': sobre.tipoDeContenido },
    body: sobre.cuerpo,
  });
  return r.status;
};

describe.skipIf(URL_BASE === undefined)('DoD de la ETAPA 12, real (15-Q, Q8)', () => {
  it('con WAN: el Edge descarga la instantánea que la API publica', async () => {
    const r = await edge.contingencia.tic(new Date(T0));
    expect(r.modo).toBe('en_linea');
    expect(r.descarga).toMatchObject({ estado: 'nueva' });
  });

  it('30 minutos sin WAN: 20 accesos resueltos y accionados en el sitio', async () => {
    wan = false;
    expect((await edge.contingencia.tic(new Date(T0 + MINUTO))).modo).toBe('autonomo');
    const antes = aperturasFisicasPor.get(HOST_CAMARA) ?? 0;
    for (let i = 0; i < 20; i += 1) {
      const instante = new Date(T0 + 2 * MINUTO + i * 90_000);
      const referencia = `dod-${CORRIDA}-${String(i)}`;
      expect(await publicar(PLACAS[i % PLACAS.length] ?? 'X', referencia, instante)).toBe(200);
      claves.push(referencia);
      // El tic sigue corriendo durante el corte, como en sitio (cada 15 s).
      await edge.contingencia.tic(new Date(instante.getTime() + 15_000));
    }
    expect(edge.bandeja.cuantosPendientes()).toBe(20);
    // Se abrió la barrera por cada placa permitida —residentes, sin dueño y la
    // visita: 5 de cada 7— y por ninguna de las negadas (lista negra, desconocida).
    expect((aperturasFisicasPor.get(HOST_CAMARA) ?? 0) - antes).toBe(ABIERTAS);
    await edge.contingencia.tic(new Date(T0 + 32 * MINUTO));
    expect(edge.bandeja.cuantosPendientes()).toBe(20);
  });

  it('al reconectar: los 20 en la nube EXACTAMENTE una vez, en menos de 5 minutos', async () => {
    wan = true;
    perderLaPrimeraRespuesta = true;
    const vuelta = T0 + 32 * MINUTO;
    let t = vuelta;
    while (edge.bandeja.cuantosPendientes() > 0 && t - vuelta < 5 * MINUTO) {
      t += 15_000;
      await edge.contingencia.tic(new Date(t));
    }
    expect(edge.bandeja.cuantosPendientes()).toBe(0);
    expect(t - vuelta).toBeLessThan(5 * MINUTO);
    // La respuesta perdida OCURRIÓ: si no, «exactamente una vez» no probaría nada.
    expect(perderLaPrimeraRespuesta).toBe(false);

    // Por la referencia de ESTA corrida: la base de pruebas guarda las anteriores.
    const { rows } = await (pool as Pool).query<{ n: string; edge: boolean; distintos: string }>(
      `SELECT count(*)::text AS n, bool_and(e.decidido_por_edge) AS edge,
              count(DISTINCT e.clave_idempotencia)::text AS distintos
         FROM public.eventos e
        WHERE e.copropiedad_id = $1 AND e.dispositivo_id = $2
          AND e.clave_idempotencia LIKE $3 AND e.ocurrido_en >= $4`,
      [COP_A, CAMARA, `%:dod-${CORRIDA}-%`, new Date(T0)],
    );
    expect(rows[0]).toEqual({ n: '20', edge: true, distintos: '20' });
  });

  it('cada apertura del Edge quedó con su constancia, atribuida al Edge', async () => {
    const { rows } = await (pool as Pool).query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.eventos_de_equipo
        WHERE copropiedad_id = $1 AND dispositivo_id = $2 AND tipo = 'apertura_ordenada'
          AND carga->>'edgeId' = $3 AND ocurrido_en >= $4`,
      [COP_A, CAMARA, await edgeId(), new Date(T0)],
    );
    expect(Number(rows[0]?.n)).toBe(ABIERTAS);
  });
});

/** El identificador del Edge de esta corrida, desde su propia configuración. */
const edgeId = async (): Promise<string> => {
  const { rows } = await (pool as Pool).query<{ id: string }>(
    `SELECT id FROM public.edge_gateways WHERE nombre = $1`,
    [`Edge DoD ${CORRIDA}`],
  );
  return rows[0]?.id ?? '';
};
