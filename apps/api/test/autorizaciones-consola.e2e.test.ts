import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Autorizacion } from '@ncr/domain-core';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import { RepositorioAutorizacionesPg } from '../src/autorizaciones/infraestructura/repositorio-autorizaciones-pg';
import type {
  AutorizacionEnLista,
  FotografiaDeVisitante,
  RepositorioAutorizaciones,
  RepositorioDeConsultaDeAutorizaciones,
} from '../src/autorizaciones/aplicacion/puertos';

/**
 * O3 · el CRUD de visitantes desde la consola, de extremo a extremo por HTTP:
 * crear con placa y observaciones, modificar, adjuntar la fotografía y pedir
 * su URL firmada. El repositorio es un doble en memoria (D-17: sin base en la
 * suite e2e); lo que se ejercita es la tubería real —DTOs, guards, tope de
 * cuerpo propio de la ruta de fotografía, casos de uso y almacén firmado—.
 *
 * Y lo que NO sale por la API: bytes, claves del bucket como dato permanente,
 * ni una fotografía que no sea lo que dice ser (§2.7.8).
 */
class RepoEnMemoria implements RepositorioAutorizaciones, RepositorioDeConsultaDeAutorizaciones {
  readonly guardadas = new Map<string, Autorizacion>();
  readonly fotografias = new Map<string, FotografiaDeVisitante>();
  async guardar(_c: string, a: Autorizacion): Promise<void> {
    this.guardadas.set(a.id, a);
  }
  async porId(_c: string, id: string): Promise<Autorizacion | null> {
    return this.guardadas.get(id) ?? null;
  }
  async vigentesDePersona(): Promise<readonly Autorizacion[]> {
    return [];
  }
  async activasParaLectura(): Promise<readonly Autorizacion[]> {
    return [];
  }
  async adjuntarFotografia(_c: string, id: string, f: FotografiaDeVisitante): Promise<boolean> {
    if (!this.guardadas.has(id)) return false;
    this.fotografias.set(id, f);
    return true;
  }
  async fotografiaDe(_c: string, id: string): Promise<FotografiaDeVisitante | null> {
    return this.fotografias.get(id) ?? null;
  }
  async listar(): Promise<readonly AutorizacionEnLista[]> {
    return [...this.guardadas.values()].map((a) => ({
      id: a.id,
      viviendaId: a.viviendaId,
      vivienda: 'A-01',
      visitante: 'Visitante de prueba',
      documento: '1',
      desde: a.vigencia.desde.toISOString(),
      hasta: a.vigencia.hasta.toISOString(),
      tipo: a.esRecurrente ? 'recurrente' : 'unica',
      estado: a.estado === 'revocada' ? 'revocada' : 'activa',
      placa: a.placa?.valor ?? null,
      acompanantes: a.acompanantes.map((x) => x.nombre),
      patron: null,
      revocadaEn: a.revocadaEn?.toISOString() ?? null,
      motivoRevocacion: a.motivoRevocacion,
      observaciones: a.observaciones,
      tieneFotografia: this.fotografias.has(a.id),
    }));
  }
}

const VIVIENDA = '30000000-0000-4000-8000-0000000000bb';
const PERSONA = '20000000-0000-4000-8000-0000000000aa';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const GIF = Buffer.from('GIF89a\u0000\u0000', 'latin1');

describe('O3 · visitantes desde la consola (placa, observaciones, modificación, fotografía)', () => {
  let app: INestApplication;
  let admin: string;
  let residente: string;
  const repo = new RepoEnMemoria();

  beforeAll(async () => {
    const firmante = await crearFirmante();
    app = await crearApp(firmante, (b) =>
      b.overrideProvider(RepositorioAutorizacionesPg).useValue(repo),
    );
    admin = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    residente = await tokenDe(firmante, { rol: 'residente', copropiedadId: COP_A });
  });
  afterAll(async () => {
    await app.close();
  });

  const base = () => `/copropiedades/${COP_A}/autorizaciones`;
  const enUnDia = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const enDosDias = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

  let autorizacionId = '';

  it('crea con placa (normalizada por el objeto de valor) y observaciones', async () => {
    const r = await request(app.getHttpServer())
      .post(base())
      .set('authorization', `Bearer ${admin}`)
      .send({
        viviendaId: VIVIENDA,
        personaId: PERSONA,
        desde: new Date().toISOString(),
        hasta: enUnDia,
        placa: ' abc-123 ',
        observaciones: 'Trae el mercado',
      })
      .expect(201);
    autorizacionId = r.body.id as string;

    const lista = await request(app.getHttpServer())
      .get(base())
      .set('authorization', `Bearer ${admin}`)
      .expect(200);
    const fila = (lista.body as AutorizacionEnLista[]).find((a) => a.id === autorizacionId);
    expect(fila?.placa).toBe('ABC123');
    expect(fila?.observaciones).toBe('Trae el mercado');
    expect(fila?.tieneFotografia).toBe(false);
  });

  it('una placa imposible se rechaza con motivo, sin crear nada', async () => {
    const antes = repo.guardadas.size;
    const r = await request(app.getHttpServer())
      .post(base())
      .set('authorization', `Bearer ${admin}`)
      .send({
        viviendaId: VIVIENDA,
        personaId: PERSONA,
        desde: new Date().toISOString(),
        hasta: enUnDia,
        placa: 'AB-12Ω3',
      })
      .expect(400);
    expect(JSON.stringify(r.body)).toMatch(/placa/i);
    expect(repo.guardadas.size).toBe(antes);
  });

  it('PUT modifica fin de vigencia y observaciones; `placa: null` la quita', async () => {
    await request(app.getHttpServer())
      .put(`${base()}/${autorizacionId}`)
      .set('authorization', `Bearer ${admin}`)
      .send({ hasta: enDosDias, observaciones: 'Llega tarde', placa: null })
      .expect(200, { modificada: true });
    const a = repo.guardadas.get(autorizacionId);
    expect(a?.vigencia.hasta.toISOString()).toBe(enDosDias);
    expect(a?.observaciones).toBe('Llega tarde');
    expect(a?.placa).toBeNull();

    // Forma: una placa de dos letras no pasa ni del DTO.
    await request(app.getHttpServer())
      .put(`${base()}/${autorizacionId}`)
      .set('authorization', `Bearer ${admin}`)
      .send({ placa: 'AB' })
      .expect(400);
  });

  it('sin fotografía, pedirla es 404; el residente no adjunta desde esta consola', async () => {
    await request(app.getHttpServer())
      .get(`${base()}/${autorizacionId}/fotografia`)
      .set('authorization', `Bearer ${admin}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${base()}/${autorizacionId}/fotografia`)
      .set('authorization', `Bearer ${residente}`)
      .send({ tipoMime: 'image/jpeg', contenidoBase64: JPEG.toString('base64') })
      .expect(403);
  });

  it('un JPEG real se adjunta; la lista lo refleja y la URL sale firmada y caduca', async () => {
    const r = await request(app.getHttpServer())
      .post(`${base()}/${autorizacionId}/fotografia`)
      .set('authorization', `Bearer ${admin}`)
      .send({ tipoMime: 'image/jpeg', contenidoBase64: JPEG.toString('base64') })
      .expect(201);
    expect(r.body).toEqual({ adjuntada: true, tipoMime: 'image/jpeg', tamanoBytes: JPEG.length });

    const lista = await request(app.getHttpServer())
      .get(base())
      .set('authorization', `Bearer ${admin}`)
      .expect(200);
    const fila = (lista.body as AutorizacionEnLista[]).find((a) => a.id === autorizacionId);
    expect(fila?.tieneFotografia).toBe(true);

    const url = await request(app.getHttpServer())
      .get(`${base()}/${autorizacionId}/fotografia`)
      .set('authorization', `Bearer ${admin}`)
      .expect(200);
    // Sólo la URL y su vida: ni bytes, ni hash, ni identificador de evidencia.
    expect(Object.keys(url.body).sort()).toEqual(['expiraEnSegundos', 'url']);
    expect(url.body.expiraEnSegundos).toBe(120);
    expect(url.body.url).toMatch(/[?&]firma=[0-9a-f]{64}/);
    expect(url.body.url).toMatch(/[?&]expira=\d+/);
  });

  it('un PNG disfrazado de JPEG y un GIF se rechazan por sus BYTES (§2.7.8)', async () => {
    const disfrazado = await request(app.getHttpServer())
      .post(`${base()}/${autorizacionId}/fotografia`)
      .set('authorization', `Bearer ${admin}`)
      .send({ tipoMime: 'image/jpeg', contenidoBase64: PNG.toString('base64') })
      .expect(400);
    expect(JSON.stringify(disfrazado.body)).toMatch(/no coincide/);

    const gif = await request(app.getHttpServer())
      .post(`${base()}/${autorizacionId}/fotografia`)
      .set('authorization', `Bearer ${admin}`)
      .send({ tipoMime: 'image/png', contenidoBase64: GIF.toString('base64') })
      .expect(400);
    expect(JSON.stringify(gif.body)).toMatch(/cabecera/);

    // Forma: ni un tipo fuera de la lista ni una cadena que no es base64.
    await request(app.getHttpServer())
      .post(`${base()}/${autorizacionId}/fotografia`)
      .set('authorization', `Bearer ${admin}`)
      .send({ tipoMime: 'image/svg+xml', contenidoBase64: JPEG.toString('base64') })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base()}/${autorizacionId}/fotografia`)
      .set('authorization', `Bearer ${admin}`)
      .send({ tipoMime: 'image/jpeg', contenidoBase64: 'esto no es base64!!' })
      .expect(400);
  });

  it('la ruta de fotografía admite más que el tope general, y sigue acotada', async () => {
    // 600 kB de JPEG: no cabe en `LIMITE_PAYLOAD` (256 kB) y sí en el de la ruta.
    const grande = Buffer.concat([JPEG, Buffer.alloc(600 * 1024, 0x11)]);
    await request(app.getHttpServer())
      .post(`${base()}/${autorizacionId}/fotografia`)
      .set('authorization', `Bearer ${admin}`)
      .send({ tipoMime: 'image/jpeg', contenidoBase64: grande.toString('base64') })
      .expect(201);
    // 1,8 MiB supera el tope del caso de uso: el tope de la ruta no lo anula.
    const excesivo = Buffer.concat([JPEG, Buffer.alloc(1800 * 1024, 0x11)]);
    await request(app.getHttpServer())
      .post(`${base()}/${autorizacionId}/fotografia`)
      .set('authorization', `Bearer ${admin}`)
      .send({ tipoMime: 'image/jpeg', contenidoBase64: excesivo.toString('base64') })
      .expect((r) => {
        if (r.status !== 400 && r.status !== 413)
          throw new Error(`esperaba 400/413, fue ${r.status}`);
      });
  });

  it('a una revocada no se le adjunta fotografía (409)', async () => {
    await request(app.getHttpServer())
      .post(`${base()}/${autorizacionId}/revocacion`)
      .set('authorization', `Bearer ${admin}`)
      .send({ motivo: 'ya no viene' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${base()}/${autorizacionId}/fotografia`)
      .set('authorization', `Bearer ${admin}`)
      .send({ tipoMime: 'image/jpeg', contenidoBase64: JPEG.toString('base64') })
      .expect(409);
  });
});
