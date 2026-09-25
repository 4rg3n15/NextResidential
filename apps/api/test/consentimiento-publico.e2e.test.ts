import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { FACE_TEMPLATE_PROVIDER } from '@ncr/domain-core';
import { capacidadesDescubiertas } from '@ncr/providers';
import type { MockProvider } from '@ncr/providers';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { REPOSITORIO_DE_EQUIPOS } from '../src/equipos';
import type { RepositorioDeEquipos } from '../src/equipos';
import type { ContextoTenant } from '../src/autenticacion';
import { FirmanteHmacDeEnlaces } from '../src/biometria/infraestructura/firmante-de-enlaces';
import { configuracionDePrueba } from './utilidades';
import { AuditoriaEnMemoria } from '../src/comun/auditoria';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A3 (ETAPA 15-E) · EL TITULAR RESPONDE POR SU ENLACE, Y LA PLANTILLA VIAJA
 *
 * El recorrido que el usuario hará en sitio haciendo de visitante: el portero
 * captura desde la consola, emite el enlace, el visitante lo abre en su
 * teléfono —sin sesión— y acepta; la plantilla sale a TODAS las terminales
 * con biblioteca de rostros; después revoca y la plantilla se retira en el
 * acto. Todo contra el `MockProvider` (ADR-03) y con el registro de equipos
 * en memoria, que es lo que la suite tiene.
 *
 * Y lo que la puerta pública NO hace: abrir con un token alterado, caducado o
 * de otra copropiedad; ni aceptar una respuesta que no sea `si`/`no`.
 */
const TITULAR = '40000000-0000-4000-8000-000000000103';
const HORA = 3_600_000;
const VECTOR = Buffer.from([9, 8, 7, 6, 5, 4, 3, 2, 1]).toString('base64');

let app: INestApplication;
let firmante: Firmante;
let tokenAdmin: string;
let tokenPortero: string;
let mock: MockProvider;
let terminalId = '';
let videoporteroId = '';
let sinBibliotecaId = '';

const ctxAdmin: ContextoTenant = {
  usuarioId: '00000000-0000-4000-8000-000000000002',
  rol: 'administrador',
  copropiedadId: COP_A,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
};

const alta = (nombre: string, tipo: 'terminal_facial' | 'intercom' | 'camara_lpr') => ({
  nombre,
  tipo,
  host: `${nombre.toLowerCase().replaceAll(' ', '-')}.invalid`,
  puerto: 80,
  protocolo: 'http' as const,
  usuario: 'servicio',
  secreto: 'clave-de-pruebas-1',
});

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  tokenAdmin = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  tokenPortero = await tokenDe(firmante, { rol: 'portero', copropiedadId: COP_A });
  mock = app.get(FACE_TEMPLATE_PROVIDER) as MockProvider;

  // Tres equipos: dos CON biblioteca de rostros (terminal y videoportero) y
  // una cámara sin ella. La sincronización total va por capacidad (ADR-019).
  const equipos = app.get<RepositorioDeEquipos>(REPOSITORIO_DE_EQUIPOS);
  const conBiblioteca = {
    clase: 'alcanzado' as const,
    detalle: 'responde',
    modelo: 'M',
    firmware: 'V0',
    latenciaMs: 1,
    verificado: true,
    capacidades: capacidadesDescubiertas({
      bibliotecaDeRostros: { estado: 'si', maximo: 100, almacenadas: 0 },
      gestionDePersonas: 'si',
    }),
  };
  terminalId = (
    await equipos.crear(ctxAdmin, COP_A, alta('Terminal', 'terminal_facial'), conBiblioteca)
  ).id;
  videoporteroId = (
    await equipos.crear(ctxAdmin, COP_A, alta('Videoportero', 'intercom'), conBiblioteca)
  ).id;
  sinBibliotecaId = (
    await equipos.crear(ctxAdmin, COP_A, alta('Camara', 'camara_lpr'), {
      ...conBiblioteca,
      capacidades: capacidadesDescubiertas({ reconocimientoDePlacas: 'si' }),
    })
  ).id;
  for (const id of [terminalId, videoporteroId, sinBibliotecaId]) mock.dispositivos.add(id);
});
afterAll(async () => {
  await app?.close();
});

const con = (token: string, metodo: 'get' | 'post', ruta: string) =>
  request(app.getHttpServer())[metodo](ruta).set('Authorization', `Bearer ${token}`);
const base = `/copropiedades/${COP_A}/biometria`;

const capturar = async () => {
  const r = await con(tokenPortero, 'post', `${base}/capturas`)
    .send({
      titularId: TITULAR,
      medidas: { rostrosDetectados: 1, nitidez: 0.85, iluminacion: 0.6, proporcionRostro: 0.4 },
      vector: VECTOR,
      versionPolitica: 'v1.0',
      canal: 'sms',
      suprimirEn: new Date(Date.now() + 8 * HORA).toISOString(),
    })
    .expect(201);
  return r.body as { plantillaId: string; consentimientoId: string };
};

const emitirEnlace = async (consentimientoId: string) => {
  const r = await con(tokenPortero, 'post', `${base}/consentimientos/${consentimientoId}/enlace`)
    .send()
    .expect(201);
  return r.body as { token: string; ruta: string; url: string | null; expiraEn: string };
};

const tienePlantilla = (dispositivoId: string, plantillaId: string): boolean =>
  mock.plantillas.get(dispositivoId)?.has(plantillaId) ?? false;

describe('el enlace del titular', () => {
  it('lo emite el portero; sin API_URL_PUBLICA entrega la ruta y url nula', async () => {
    const { consentimientoId } = await capturar();
    const e = await emitirEnlace(consentimientoId);
    expect(e.ruta).toMatch(/^\/consentimiento\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(e.url).toBeNull();
    expect(new Date(e.expiraEn).getTime()).toBeGreaterThan(Date.now());
  });

  it('la página del titular se sirve SIN sesión, como HTML, y ofrece aceptar o no', async () => {
    const { consentimientoId } = await capturar();
    const { ruta } = await emitirEnlace(consentimientoId);
    const r = await request(app.getHttpServer()).get(ruta).expect(200);
    expect(r.headers['content-type']).toMatch(/text\/html/);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.text).toContain('Acepto');
    expect(r.text).toContain('No acepto');
    expect(r.text).toContain('v1.0');
    // Nada del titular más allá de lo que decide: ni nombre, ni documento.
    expect(r.text).not.toContain(TITULAR);
    // Y nada que la CSP de §2.7.7 rechazaría.
    expect(r.text).not.toMatch(/<script|style=|<style/);
  });

  it('el titular acepta desde su teléfono → vigente → la plantilla llega a TODOS los equipos con biblioteca', async () => {
    const { consentimientoId, plantillaId } = await capturar();
    const { ruta } = await emitirEnlace(consentimientoId);

    const post = await request(app.getHttpServer())
      .post(`${ruta}/respuesta`)
      .type('form')
      .send({ acepta: 'si' })
      .expect(303);
    expect(post.headers.location).toBe(ruta);

    expect(tienePlantilla(terminalId, plantillaId)).toBe(true);
    expect(tienePlantilla(videoporteroId, plantillaId)).toBe(true);
    expect(tienePlantilla(sinBibliotecaId, plantillaId)).toBe(false);

    const estado = await con(
      tokenAdmin,
      'get',
      `${base}/consentimientos/${consentimientoId}`,
    ).expect(200);
    expect(estado.body.estado).toBe('vigente');

    // El enlace con el que aceptó está GASTADO: de un solo uso. Muestra lo que
    // el titular decidió, sin formularios, y no revoca.
    const gastado = await request(app.getHttpServer()).get(ruta).expect(200);
    expect(gastado.text).toContain('Consentimiento otorgado');
    expect(gastado.text).toContain('Este enlace ya se usó');
    expect(gastado.text).not.toContain('Revocar mi consentimiento');
    await request(app.getHttpServer()).post(`${ruta}/revocacion`).expect(303);
    expect(tienePlantilla(terminalId, plantillaId)).toBe(true);

    // Para revocar hace falta un enlace NUEVO, emitido después de otorgar.
    const { ruta: rutaNueva } = await emitirEnlace(consentimientoId);
    const otorgado = await request(app.getHttpServer()).get(rutaNueva).expect(200);
    expect(otorgado.text).toContain('Consentimiento otorgado');
    expect(otorgado.text).toContain('Revocar mi consentimiento');

    // Y revoca: la plantilla sale de los equipos EN EL ACTO (CA-11).
    await request(app.getHttpServer()).post(`${rutaNueva}/revocacion`).expect(303);
    expect(tienePlantilla(terminalId, plantillaId)).toBe(false);
    expect(tienePlantilla(videoporteroId, plantillaId)).toBe(false);
    const revocado = await con(tokenAdmin, 'get', `${base}/consentimientos/${consentimientoId}`);
    expect(revocado.body.estado).toBe('revocado');
    // Y ese enlace también quedó gastado: muestra «revocado», sin formularios.
    const cerrada = await request(app.getHttpServer()).get(rutaNueva).expect(200);
    expect(cerrada.text).toContain('revocado');
    expect(cerrada.text).not.toContain('<form');
  });

  it('el titular rechaza: nada viaja y la página lo dice', async () => {
    const { consentimientoId, plantillaId } = await capturar();
    const { ruta } = await emitirEnlace(consentimientoId);
    await request(app.getHttpServer())
      .post(`${ruta}/respuesta`)
      .type('form')
      .send({ acepta: 'no' })
      .expect(303);
    expect(tienePlantilla(terminalId, plantillaId)).toBe(false);
    // El enlace se gastó con el rechazo: muestra el estado y ningún formulario.
    const pagina = await request(app.getHttpServer()).get(ruta).expect(200);
    expect(pagina.text).toContain('rechazado');
    expect(pagina.text).toContain('Este enlace ya se usó');
    expect(pagina.text).not.toContain('<form');
    const estado = await con(tokenAdmin, 'get', `${base}/consentimientos/${consentimientoId}`);
    expect(estado.body.estado).toBe('rechazado');
    // Un consentimiento cerrado ya no admite enlace nuevo.
    await con(tokenPortero, 'post', `${base}/consentimientos/${consentimientoId}/enlace`)
      .send()
      .expect(403);
  });

  it('responder dos veces con el mismo enlace: la segunda no cambia nada (un solo uso)', async () => {
    const { consentimientoId } = await capturar();
    const { ruta } = await emitirEnlace(consentimientoId);
    await request(app.getHttpServer())
      .post(`${ruta}/respuesta`)
      .type('form')
      .send({ acepta: 'no' });
    await request(app.getHttpServer())
      .post(`${ruta}/respuesta`)
      .type('form')
      .send({ acepta: 'si' })
      .expect(303);
    const estado = await con(tokenAdmin, 'get', `${base}/consentimientos/${consentimientoId}`);
    expect(estado.body.estado).toBe('rechazado');
    const pagina = await request(app.getHttpServer()).get(ruta).expect(200);
    expect(pagina.text).not.toContain('<form');
  });

  it('la respuesta del titular deja evidencia: versión de la política, respuesta y origen', async () => {
    const { consentimientoId } = await capturar();
    const { ruta } = await emitirEnlace(consentimientoId);
    const auditoria = app.get(AuditoriaEnMemoria);
    const antes = auditoria.respuestasDeTitular.length;
    await request(app.getHttpServer())
      .post(`${ruta}/respuesta`)
      .type('form')
      .set('User-Agent', 'telefono-del-visitante/1.0')
      .send({ acepta: 'si' })
      .expect(303);
    const constancia = auditoria.respuestasDeTitular
      .slice(antes)
      .find((r) => r.consentimientoId === consentimientoId);
    expect(constancia?.respuesta).toBe('aceptado');
    expect(constancia?.versionPolitica).toBe('v1.0');
    expect(constancia?.userAgent).toBe('telefono-del-visitante/1.0');
    expect(constancia?.ip).toBeTruthy();
  });

  it('una respuesta que no es si/no se rechaza con 400', async () => {
    const { consentimientoId } = await capturar();
    const { ruta } = await emitirEnlace(consentimientoId);
    await request(app.getHttpServer())
      .post(`${ruta}/respuesta`)
      .type('form')
      .send({ acepta: 'tal vez' })
      .expect(400);
  });

  it('un token alterado, uno de otra copropiedad y uno caducado dan 404 con la página', async () => {
    const { consentimientoId } = await capturar();
    const { token } = await emitirEnlace(consentimientoId);
    const [cuerpo, firma] = token.split('.') as [string, string];
    const alterado = `${cuerpo.slice(0, -2)}AA.${firma}`;
    const r = await request(app.getHttpServer()).get(`/consentimiento/${alterado}`).expect(404);
    expect(r.headers['content-type']).toMatch(/text\/html/);
    expect(r.text).toContain('no es válido');

    // Firmado de verdad con la llave del proceso, pero para la copropiedad B:
    // la llave se deriva por tenant, y el consentimiento no está allí.
    const firmanteLocal = new FirmanteHmacDeEnlaces(configuracionDePrueba.BIOMETRIA_LLAVE);
    const ajeno = firmanteLocal.firmar({
      copropiedadId: COP_B,
      consentimientoId,
      titularId: TITULAR,
      expiraEn: new Date(Date.now() + HORA),
      estadoAlEmitir: 'pendiente' as const,
    });
    await request(app.getHttpServer()).get(`/consentimiento/${ajeno}`).expect(404);

    const caducado = firmanteLocal.firmar({
      copropiedadId: COP_A,
      consentimientoId,
      titularId: TITULAR,
      expiraEn: new Date(Date.now() - 1000),
      estadoAlEmitir: 'pendiente' as const,
    });
    await request(app.getHttpServer()).get(`/consentimiento/${caducado}`).expect(404);
    await request(app.getHttpServer())
      .post(`/consentimiento/${caducado}/respuesta`)
      .type('form')
      .send({ acepta: 'si' })
      .expect(303);
    const estado = await con(tokenAdmin, 'get', `${base}/consentimientos/${consentimientoId}`);
    expect(estado.body.estado).toBe('pendiente');
  });

  it('la ruta autenticada de respuesta también propaga a todas las terminales', async () => {
    const { consentimientoId, plantillaId } = await capturar();
    const tokenTitular = await tokenDe(firmante, {
      rol: 'residente',
      copropiedadId: COP_A,
      usuarioId: TITULAR,
    });
    const r = await con(
      tokenTitular,
      'post',
      `${base}/consentimientos/${consentimientoId}/respuesta`,
    )
      .send({ acepta: true })
      .expect(201);
    expect(r.body.estado).toBe('vigente');
    expect(r.body.propagacion).toHaveLength(1);
    expect(r.body.propagacion[0]).toMatchObject({ plantillaId, terminales: 2, sincronizadas: 2 });
    expect(tienePlantilla(terminalId, plantillaId)).toBe(true);
    // Y la total se puede relanzar desde la consola sin duplicar nada.
    const total = await con(
      tokenAdmin,
      'post',
      `${base}/plantillas/${plantillaId}/sincronizacion-total`,
    )
      .send()
      .expect(201);
    expect(total.body).toMatchObject({ terminales: 2, sincronizadas: 2, fallidas: 0 });
    await con(tokenTitular, 'post', `${base}/consentimientos/${consentimientoId}/revocacion`)
      .send()
      .expect(201);
  });

  it('la sincronización total sin consentimiento vigente no toca ninguna terminal', async () => {
    const { plantillaId } = await capturar();
    await con(tokenAdmin, 'post', `${base}/plantillas/${plantillaId}/sincronizacion-total`)
      .send()
      .expect(403);
    expect(tienePlantilla(terminalId, plantillaId)).toBe(false);
  });

  it('el portero no lanza la sincronización total ni el residente emite enlaces', async () => {
    const { consentimientoId, plantillaId } = await capturar();
    await con(tokenPortero, 'post', `${base}/plantillas/${plantillaId}/sincronizacion-total`)
      .send()
      .expect(403);
    const tokenResidente = await tokenDe(firmante, { rol: 'residente', copropiedadId: COP_A });
    await con(tokenResidente, 'post', `${base}/consentimientos/${consentimientoId}/enlace`)
      .send()
      .expect(403);
  });
});
