import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import { URL_BASE, exigirBase } from './base-exigida';
import { cabecerasDelEdge } from './edge-de-prueba';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q · Q1 · LA INSTANTÁNEA CONTRA LA BASE REAL · cierra S-24
 *
 * El alta del Edge por el superadministrador, la primera descarga que PUBLICA
 * una versión en `versiones_de_reglas` (0049), «sin cambios» mientras nada
 * cambie, una versión nueva en cuanto cambia una regla, lo que el Edge tiene
 * anotado en `edge_gateways`, y —contra la base— el acceso cruzado que queda en
 * `auditoria_seguridad` y la bandeja que escribe accesos y aperturas.
 *
 * Se salta sin `DATABASE_URL_PRUEBAS`; `--con-base` la exige.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CORRIDA = randomBytes(3).toString('hex').toUpperCase();
/** La cámara LPR de la semilla de MIRA: el evento tiene que ser de un equipo real. */
const CAMARA_DE_MIRA = '90000000-0000-4000-8000-000000000001';
let pool: Pool | undefined;
let app: INestApplication | undefined;
let disponible = false;
let edge: { id: string; copropiedadId: string; credencialRef: string; secreto: string };

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
    .send({ nombre: `Edge 15-Q ${CORRIDA}` });
  if (alta.status !== 201) throw new Error(`alta del Edge: ${String(alta.status)}`);
  edge = {
    id: alta.body.edgeId,
    copropiedadId: COP_A,
    credencialRef: alta.body.credencialRef,
    secreto: alta.body.secreto,
  };
  disponible = true;
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

exigirBase('sin DATABASE_URL_PRUEBAS', () => disponible);

const pedir = (cop: string, desde: number) => {
  const ruta = `/copropiedades/${cop}/reglas/instantanea?desde=${String(desde)}`;
  return request((app as INestApplication).getHttpServer())
    .get(ruta)
    .set(cabecerasDelEdge(edge, 'GET', ruta, '', { credencial: edge.secreto }));
};

describe.skipIf(URL_BASE === undefined)('la instantánea del Edge contra la base (Q1)', () => {
  let version = 0;

  it('la primera descarga publica (o reutiliza) la versión de ESE contenido, con su hash', async () => {
    const r = await pedir(COP_A, 0).expect(200);
    version = r.body.version;
    expect(version).toBeGreaterThanOrEqual(1);
    const { rows } = await (pool as Pool).query<{ hash: string }>(
      'SELECT hash FROM public.versiones_de_reglas WHERE copropiedad_id = $1 AND numero = $2',
      [COP_A, version],
    );
    expect(rows[0]?.hash).toBe(r.body.hash);
    // El padrón y la lista negra de la semilla viajan; ningún vector, ningún nombre.
    expect(r.body.vehiculos.length).toBeGreaterThan(0);
    expect(r.body.placasEnListaNegra).toContain('XYZ0000');
    expect(JSON.stringify(r.body)).not.toMatch(/vector|nombre_completo/i);
    for (const a of r.body.acompanantes ?? []) expect(a.nombre).toBe('');
  });

  it('mientras nada cambie, «sin cambios» con la versión vigente', async () => {
    const r = await pedir(COP_A, version).expect(200);
    expect(r.body).toMatchObject({ copropiedadId: COP_A, version, sinCambios: true });
  });

  it('en cuanto cambia una regla (un veto nuevo) hay versión nueva y lo trae', async () => {
    const placa = `Q${CORRIDA}`;
    await (pool as Pool).query(
      `INSERT INTO public.listas_negras (copropiedad_id, placa, motivo, estado, creado_por, actualizado_por)
       VALUES ($1, $2, 'prueba 15-Q', 'activa', '00000000-0000-4000-8000-000000000010',
               '00000000-0000-4000-8000-000000000010')`,
      [COP_A, placa],
    );
    const r = await pedir(COP_A, version).expect(200);
    expect(r.body.version).toBe(version + 1);
    expect(r.body.placasEnListaNegra).toContain(placa);
    version = r.body.version;
  });

  it('la nube anota qué versión tiene ese Edge y cuándo se oyó de él (D-16)', async () => {
    const { rows } = await (pool as Pool).query<{ v: string; latido: Date | null }>(
      'SELECT version_reglas_cache::text AS v, ultimo_latido AS latido FROM public.edge_gateways WHERE id = $1',
      [edge.id],
    );
    expect(Number(rows[0]?.v)).toBe(version);
    expect(rows[0]?.latido).not.toBeNull();
  });

  it('RN-15 · pedir EL ROBLE es 404 y queda en auditoria_seguridad como acceso cruzado', async () => {
    await pedir(COP_B, 0).expect(404);
    const { rows } = await (pool as Pool).query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.auditoria_seguridad
        WHERE tipo = 'acceso_cruzado' AND copropiedad_id_objetivo = $1
          AND recurso = $2`,
      [COP_B, `edge:/copropiedades/${COP_B}/reglas/instantanea`],
    );
    expect(Number(rows[0]?.n)).toBeGreaterThan(0);
  });

  it('la bandeja escribe el acceso decidido por el Edge y la apertura que hizo, una vez', async () => {
    const referencia = `q-pg-${CORRIDA}`;
    const ruta = `/copropiedades/${COP_A}/edge/reconciliacion`;
    const cuerpo = JSON.stringify({
      eventos: [
        {
          copropiedadId: COP_A,
          dispositivoId: CAMARA_DE_MIRA,
          metodo: 'placa',
          placaLeida: 'ABC1234',
          confianzaCentesimas: 95,
          referenciaExterna: referencia,
          ocurridoEn: new Date().toISOString(),
          decision: {
            permitido: true,
            reglaAplicada: 'politica.vigencia',
            versionDeReglas: version,
          },
          accionamiento: {
            tipo: 'apertura',
            estado: 'aceptada',
            latenciaMs: 300,
            ocurridoEn: new Date().toISOString(),
          },
        },
      ],
    });
    const enviar = () =>
      request((app as INestApplication).getHttpServer())
        .post(ruta)
        .set('content-type', 'application/json')
        .set(cabecerasDelEdge(edge, 'POST', ruta, cuerpo, { credencial: edge.secreto }))
        .send(cuerpo);
    const r = await enviar().expect(202);
    expect(r.body.resultados[0]).toMatchObject({ aceptado: true, duplicado: false });
    expect((await enviar().expect(202)).body.resultados[0]).toMatchObject({ duplicado: true });

    const accesos = await (pool as Pool).query<{ n: string; edge: boolean; v: string }>(
      `SELECT count(*)::text AS n, bool_and(decidido_por_edge) AS edge, max(version_reglas)::text AS v
         FROM public.eventos e JOIN public.recepciones_evento r ON r.evento_id = e.id
        WHERE r.copropiedad_id = $1 AND r.clave_idempotencia = $2`,
      [COP_A, r.body.resultados[0].claveIdempotencia],
    );
    expect(accesos.rows[0]).toEqual({ n: '1', edge: true, v: String(version) });
    const aperturas = await (pool as Pool).query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.eventos_de_equipo
        WHERE copropiedad_id = $1 AND tipo = 'apertura_ordenada' AND carga->>'edgeId' = $2`,
      [COP_A, edge.id],
    );
    expect(aperturas.rows[0]?.n).toBe('1');
  });
});
