import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
// `utilidades` PRIMERO: carga `AppModule` en su orden. Importar antes el barril
// de `eventos` entra por el otro extremo del ciclo eventos ↔ autorizaciones.
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import { REPOSITORIO_EVENTOS_DE_EQUIPO } from '../src/eventos';
import type { RepositorioEventosDeEquipo } from '../src/eventos';
import { AuditoriaEnMemoria } from '../src/comun/auditoria/auditoria-en-memoria';
import { REPOSITORIO_DE_GATEWAYS } from '../src/edge';
import { GatewaysEnMemoria } from '../src/edge/infraestructura/edge-en-memoria';
import { referenciaDeGeneracion } from '../src/edge/infraestructura/referencia-de-credencial';
import type { GatewayRegistrado } from '../src/edge/aplicacion/puertos';
import { cabecerasDelEdge } from './edge-de-prueba';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q · Q1 · LAS RUTAS DEL EDGE, AISLADAS POR LOS DOS CAMINOS (RN-15, KPI-37)
 *
 *  · camino del USUARIO: un token de la consola —de cualquier rol, de
 *    cualquier copropiedad— no abre las rutas del Edge. No son suyas;
 *  · camino del SERVICIO: un Edge acreditado de MIRA que pide lo de EL ROBLE
 *    recibe 404 y queda en la auditoría de seguridad, igual que un usuario.
 *
 * Y lo que la ruta hace bien: versión y «sin cambios», el lote que no vuelve
 * a decidir, la constancia de lo que el Edge hizo con el equipo, el lote que
 * mezcla otra copropiedad, y el alta y la rotación de la credencial.
 * Sin base: el registro de gateways es el doble en memoria, sembrado aquí.
 * ═════════════════════════════════════════════════════════════════════════════
 */
let app: INestApplication;
let tokenAdminA: string;
let tokenSuper: string;
const gateways = new GatewaysEnMemoria();
const de = (copropiedadId: string, n: number): GatewayRegistrado => ({
  id: `ed${String(n)}00000-0000-4000-8000-0000000000e1`,
  copropiedadId,
  nombre: `Edge ${String(n)}`,
  usuarioServicioId: '00000000-0000-4000-8000-000000000003',
  credencialRef: referenciaDeGeneracion(1),
  activo: true,
});
const EDGE_A = de(COP_A, 1);
const EDGE_B = de(COP_B, 2);

beforeAll(async () => {
  gateways.gateways.set(EDGE_A.id, EDGE_A);
  gateways.gateways.set(EDGE_B.id, EDGE_B);
  const firmante = await crearFirmante();
  app = await crearApp(firmante, (b) =>
    b.overrideProvider(REPOSITORIO_DE_GATEWAYS).useValue(gateways),
  );
  tokenAdminA = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  tokenSuper = await tokenDe(firmante, { rol: 'superadministrador', copropiedadId: null });
});
afterAll(async () => {
  await app?.close();
});

const instantanea = (cop: string, desde = 0) =>
  `/copropiedades/${cop}/reglas/instantanea?desde=${String(desde)}`;
const pedir = (gateway: GatewayRegistrado, ruta: string) =>
  request(app.getHttpServer())
    .get(ruta)
    .set(cabecerasDelEdge(gateway, 'GET', ruta));

const evento = (
  copropiedadId: string,
  referencia: string,
  extra: Record<string, unknown> = {},
) => ({
  copropiedadId,
  dispositivoId: 'disp-talanquera-1',
  metodo: 'placa',
  placaLeida: 'ABC123',
  confianzaCentesimas: 95,
  referenciaExterna: referencia,
  ocurridoEn: '2026-10-02T03:10:00.000Z',
  cachePotencialmenteObsoleto: false,
  decision: { permitido: true, reglaAplicada: 'politica.vigencia', versionDeReglas: 1 },
  ...extra,
});
const reconciliar = (gateway: GatewayRegistrado, copropiedadRuta: string, eventos: unknown[]) => {
  const ruta = `/copropiedades/${copropiedadRuta}/edge/reconciliacion`;
  const cuerpo = JSON.stringify({ eventos });
  return request(app.getHttpServer())
    .post(ruta)
    .set('content-type', 'application/json')
    .set(cabecerasDelEdge(gateway, 'POST', ruta, cuerpo))
    .send(cuerpo);
};

describe('la instantánea del Edge (Q1)', () => {
  it('el Edge acreditado recibe SU instantánea, versionada; y «sin cambios» con ?desde=', async () => {
    const r = await pedir(EDGE_A, instantanea(COP_A)).expect(200);
    expect(r.body).toMatchObject({ copropiedadId: COP_A, version: 1, autorizaciones: [] });
    expect(r.body.hash).toMatch(/^[a-f0-9]{64}$/);
    const otra = await pedir(EDGE_A, instantanea(COP_A, 1)).expect(200);
    expect(otra.body).toMatchObject({ copropiedadId: COP_A, version: 1, sinCambios: true });
  });

  it('una versión del Edge que la nube no publicó es 409, con el remedio', async () => {
    const r = await pedir(EDGE_A, instantanea(COP_A, 99)).expect(409);
    expect(JSON.stringify(r.body)).toContain('reinicie la caché del Edge');
  });

  it('camino del USUARIO: ni el token del administrador de MIRA abre la ruta del Edge', async () => {
    await request(app.getHttpServer())
      .get(instantanea(COP_A))
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .expect(401);
  });

  it('sin identidad, o firmada con la credencial de otro Edge, 401', async () => {
    await request(app.getHttpServer()).get(instantanea(COP_A)).expect(401);
    const ruta = instantanea(COP_A);
    await request(app.getHttpServer())
      .get(ruta)
      .set(cabecerasDelEdge({ ...EDGE_A, copropiedadId: COP_B }, 'GET', ruta))
      .expect(401);
  });

  it('camino del SERVICIO: el Edge de MIRA pidiendo EL ROBLE → 404 y acceso cruzado auditado', async () => {
    const auditoria = app.get(AuditoriaEnMemoria);
    const antes = auditoria.registros.length;
    await pedir(EDGE_A, instantanea(COP_B)).expect(404);
    expect(auditoria.registros.slice(antes)).toEqual([
      expect.objectContaining({ rol: 'edge', copropiedadSolicitada: COP_B }),
    ]);
  });
});

describe('la bandeja del Edge (Q4)', () => {
  it('acepta sus eventos, deja la constancia de la apertura y descarta el reenvío (CA-22)', async () => {
    const accionamiento = {
      tipo: 'apertura',
      estado: 'aceptada',
      latenciaMs: 420,
      ocurridoEn: '2026-10-02T03:10:01.000Z',
    };
    const lote = [evento(COP_A, 'q4-ref-1', { accionamiento }), evento(COP_A, 'q4-ref-2')];
    const r = await reconciliar(EDGE_A, COP_A, lote).expect(202);
    expect(r.body.resultados.map((x: { aceptado: boolean }) => x.aceptado)).toEqual([true, true]);
    expect(r.body.resultados[0]).not.toHaveProperty('eventoId');

    const repo = app.get<
      RepositorioEventosDeEquipo & { filas: { tipo: string; carga: unknown }[] }
    >(REPOSITORIO_EVENTOS_DE_EQUIPO);
    const aperturas = repo.filas.filter((f) => f.tipo === 'apertura_ordenada');
    expect(aperturas).toHaveLength(1);
    expect(aperturas[0]?.carga).toMatchObject({
      estado: 'aceptada',
      latenciaMs: 420,
      edgeId: EDGE_A.id,
    });

    const otra = await reconciliar(EDGE_A, COP_A, lote).expect(202);
    expect(otra.body.resultados.map((x: { duplicado: boolean }) => x.duplicado)).toEqual([
      true,
      true,
    ]);
    expect(repo.filas.filter((f) => f.tipo === 'apertura_ordenada')).toHaveLength(1);
  });

  it('RN-15 · un lote con UN evento de otra copropiedad se rechaza entero, con 404', async () => {
    await reconciliar(EDGE_A, COP_A, [evento(COP_A, 'q4-ref-3'), evento(COP_B, 'q4-ref-4')]).expect(
      404,
    );
  });

  it('un cuerpo que no es JSON no se firma sobre la cadena vacía: 401 (H-13-10)', async () => {
    const ruta = `/copropiedades/${COP_A}/edge/reconciliacion`;
    await request(app.getHttpServer())
      .post(ruta)
      .set('content-type', 'text/plain')
      .set(cabecerasDelEdge(EDGE_A, 'POST', ruta, ''))
      .send('eventos')
      .expect(401);
  });
});

describe('alta y rotación de la credencial (Q5)', () => {
  it('sólo el superadministrador da de alta un Edge; la credencial sale UNA vez', async () => {
    await request(app.getHttpServer())
      .post(`/copropiedades/${COP_A}/edge-gateways`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .send({ nombre: 'Portería norte' })
      .expect(403);
    const r = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_A}/edge-gateways`)
      .set('Authorization', `Bearer ${tokenSuper}`)
      .send({ nombre: 'Portería norte' })
      .expect(201);
    expect(r.body).toMatchObject({
      copropiedadId: COP_A,
      credencialRef: referenciaDeGeneracion(1),
    });
    expect(r.body.secreto).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rotar cambia la credencial y la anterior deja de valer en el acto', async () => {
    const ruta = instantanea(COP_B);
    const vieja = cabecerasDelEdge(EDGE_B, 'GET', ruta);
    const r = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/edge-gateways/${EDGE_B.id}/credencial`)
      .set('Authorization', `Bearer ${tokenSuper}`)
      .expect(200);
    expect(r.body.credencialRef).toBe(referenciaDeGeneracion(2));
    await request(app.getHttpServer()).get(ruta).set(vieja).expect(401);
    await request(app.getHttpServer())
      .get(ruta)
      .set(cabecerasDelEdge(EDGE_B, 'GET', ruta, '', { credencial: r.body.secreto }))
      .expect(200);
  });

  it('rotar un Edge que no existe en esa copropiedad es 404', async () => {
    await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/edge-gateways/${EDGE_A.id}/credencial`)
      .set('Authorization', `Bearer ${tokenSuper}`)
      .expect(404);
  });
});
