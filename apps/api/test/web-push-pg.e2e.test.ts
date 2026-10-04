import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createECDH, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
// `utilidades` PRIMERO: carga `AppModule` en su orden (ciclo eventos ↔ autorizaciones).
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { claimsDeServicio } from '../src/comun/claims-de-servicio';
import { servicioDePushFalso } from './dobles/servicio-de-push-falso';
import type { ServicioDePushFalso } from './dobles/servicio-de-push-falso';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · B6 · EL AVISO AL RESIDENTE, DE EXTREMO A EXTREMO (P-23, DT-15N-02)
 *
 * La API real contra PostgreSQL, con llaves VAPID generadas aquí, y un servicio
 * de push falso en 127.0.0.1 que verifica la firma y DESCIFRA cada aviso. Se
 * comprueba lo que la consola no puede ver:
 *
 *  · el contenido llega cifrado y sólo lo lee el navegador suscrito;
 *  · llega SÓLO a los navegadores de esa vivienda: ni al del vecino, ni a otra
 *    copropiedad, ni a quien se suscribió a una casa que no es la suya;
 *  · una suscripción que el servicio da por muerta (410) se retira sola;
 *  · lo que la guardia lee es el número real de aparatos.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const RESIDENTE = '00000000-0000-4000-8000-000000000013';
const ADMIN_A = '00000000-0000-4000-8000-000000000010';
const ADMIN_B = '00000000-0000-4000-8000-000000000020';
const VIVIENDA = '30000000-0000-4000-8000-000000000042';
const VECINO = '30000000-0000-4000-8000-000000000001';
const VIVIENDA_B = '30000000-0000-4000-8000-000000000101';
const CORRIDA = randomBytes(4).toString('hex');

let app: INestApplication | undefined;
let pool: Pool | undefined;
let push: ServicioDePushFalso;
let firmante: Firmante;
let disponible = false;
let publica = '';

const servidor = () => (app as INestApplication).getHttpServer();
const comoResidente = () =>
  tokenDe(firmante, { rol: 'residente', copropiedadId: COP_A, usuarioId: RESIDENTE, aal: 'aal1' });
const comoGuardia = () =>
  tokenDe(firmante, { rol: 'operador_central', copropiedadId: null, copropiedades: [COP_A] });

const avisar = async (viviendaId: string, texto: string) =>
  request(servidor())
    .post(`/copropiedades/${COP_A}/guardia/avisar-residente`)
    .set('Authorization', `Bearer ${await comoGuardia()}`)
    .send({ viviendaId, texto });

/** Una fila escrita por el servicio, sin pasar por la API: lo que la RLS deja hacer. */
const filaDirecta = async (
  cop: string,
  usuario: string,
  vivienda: string,
  nombre: string,
): Promise<void> => {
  const s = push.suscribir(`${nombre}-${CORRIDA}`).cuerpo;
  const c = await (pool as Pool).connect();
  try {
    await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify(claimsDeServicio(cop)),
    ]);
    await c.query(
      `INSERT INTO public.dispositivos_de_notificacion
         (copropiedad_id, usuario_id, instalacion_id, token, plataforma, vivienda_id,
          clave_p256dh, clave_auth, creado_por, actualizado_por)
       VALUES ($1, $2, $3, $4, 'web', $5, $6, $7, $2, $2)`,
      [cop, usuario, `web:${nombre}-${CORRIDA}`, s.endpoint, vivienda, s.keys.p256dh, s.keys.auth],
    );
  } finally {
    c.release();
  }
};

const estadoDe = async (endpoint: string): Promise<{ estado: string; motivo: string | null }> => {
  const c = await (pool as Pool).connect();
  try {
    await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify(claimsDeServicio(COP_A)),
    ]);
    const { rows } = await c.query<{ estado: string; motivo: string | null }>(
      `SELECT estado::text AS estado, motivo_de_baja AS motivo
         FROM public.dispositivos_de_notificacion WHERE token = $1`,
      [endpoint],
    );
    return rows[0] ?? { estado: 'ausente', motivo: null };
  } finally {
    c.release();
  }
};

beforeAll(async () => {
  if (!URL_BASE) return;
  pool = new Pool({ connectionString: URL_BASE, max: 2 });
  try {
    await pool.query('SELECT 1 FROM public.dispositivos_de_notificacion LIMIT 1');
    disponible = true;
  } catch {
    disponible = false;
    return;
  }
  const par = createECDH('prime256v1');
  par.generateKeys();
  publica = par.getPublicKey('base64url');
  push = await servicioDePushFalso(publica);
  firmante = await crearFirmante();
  app = await crearApp(firmante, undefined, {
    PERSISTENCIA_DE_EVENTOS: 'postgres',
    CARGADOR_DE_CONTEXTO: 'postgres',
    DATABASE_URL: URL_BASE,
    DATABASE_POOLER_URL: URL_BASE,
    WEB_PUSH_VAPID_PUBLICA: publica,
    WEB_PUSH_VAPID_PRIVADA: par.getPrivateKey('base64url'),
    WEB_PUSH_SUJETO: 'mailto:pruebas@grupocontrol.co',
    WEB_PUSH_SERVICIOS_PERMITIDOS: ['127.0.0.1'],
  });
});

afterAll(async () => {
  // Las suscripciones de la corrida se dan de baja: la próxima no les envía.
  for (const cop of [COP_A, COP_B]) {
    const c = await pool?.connect();
    if (c === undefined) break;
    try {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(cop)),
      ]);
      await c.query(
        `UPDATE public.dispositivos_de_notificacion
            SET estado = 'inactivo', desactivado_en = now(), motivo_de_baja = 'fin de la prueba'
          WHERE estado = 'activo' AND token LIKE $1`,
        [`${push.origen}/%`],
      );
    } finally {
      c.release();
    }
  }
  await app?.close();
  await push?.cerrar();
  await pool?.end();
});

// H-15L-C01 · con `--con-base`, una prueba sin base FALLA aquí, con su nombre.
exigirBase('sin DATABASE_URL_PRUEBAS o sin la 0052', () => disponible);

describe('B3 · el residente suscribe su navegador', () => {
  const a = { endpoint: '', ruta: '' };

  it('la consola recibe la llave pública VAPID de la API, no de un NEXT_PUBLIC', async () => {
    if (!disponible) return;
    const res = await request(servidor())
      .get(`/copropiedades/${COP_A}/mi/notificaciones/web-push`)
      .set('Authorization', `Bearer ${await comoResidente()}`)
      .expect(200);
    expect(res.body).toEqual({ disponible: true, clavePublica: publica });
  });

  it('suscribe; volver a suscribir el mismo navegador no duplica la fila', async () => {
    if (!disponible) return;
    const s = push.suscribir(`a-${CORRIDA}`).cuerpo;
    a.endpoint = s.endpoint;
    a.ruta = new URL(s.endpoint).pathname;
    const auth = `Bearer ${await comoResidente()}`;
    const uno = await request(servidor())
      .post(`/copropiedades/${COP_A}/mi/notificaciones/web-push`)
      .set('Authorization', auth)
      .send(s)
      .expect(201);
    const dos = await request(servidor())
      .post(`/copropiedades/${COP_A}/mi/notificaciones/web-push`)
      .set('Authorization', auth)
      .send(s)
      .expect(201);
    expect(dos.body.id).toBe(uno.body.id);
  });

  it('un endpoint que no es de un servicio de push se rechaza (SSRF)', async () => {
    if (!disponible) return;
    const s = push.suscribir(`ssrf-${CORRIDA}`).cuerpo;
    await request(servidor())
      .post(`/copropiedades/${COP_A}/mi/notificaciones/web-push`)
      .set('Authorization', `Bearer ${await comoResidente()}`)
      .send({ ...s, endpoint: 'http://metadata.google.internal/computeMetadata/v1/' })
      .expect(422);
    await request(servidor())
      .post(`/copropiedades/${COP_A}/mi/notificaciones/web-push`)
      .set('Authorization', `Bearer ${await comoResidente()}`)
      .send({ ...s, keys: { p256dh: 'corta', auth: s.keys.auth } })
      .expect(400);
  });

  it('el residente de A no se suscribe a nada de B: 404', async () => {
    if (!disponible) return;
    await request(servidor())
      .post(`/copropiedades/${COP_B}/mi/notificaciones/web-push`)
      .set('Authorization', `Bearer ${await comoResidente()}`)
      .send(push.suscribir(`cruce-${CORRIDA}`).cuerpo)
      .expect(404);
  });

  it('el aviso de la guardia llega cifrado SÓLO al navegador de esa vivienda', async () => {
    if (!disponible) return;
    // El mismo residente, «suscrito» a la casa del vecino por una fila directa,
    // y un aparato de la copropiedad B: ninguno debe recibir nada.
    await filaDirecta(COP_A, RESIDENTE, VECINO, 'vecino');
    // Quien ya no es residente de la casa (aquí: el administrador, que nunca lo
    // fue) no recibe sus avisos aunque su fila diga esa vivienda.
    await filaDirecta(COP_A, ADMIN_A, VIVIENDA, 'ex-residente');
    await filaDirecta(COP_B, ADMIN_B, VIVIENDA_B, 'roble');
    const antes = push.recibidos.length;
    const res = await avisar(VIVIENDA, 'Su visita está en la portería');
    expect(res.status).toBe(202);
    expect(res.body.detalle).toMatch(/enviado a 1 aparato del residente/);
    const nuevos = push.recibidos.slice(antes);
    expect(nuevos.map((r) => r.ruta)).toEqual([a.ruta]);
    expect(nuevos[0]?.contenido).toMatchObject({
      cuerpo: 'Su visita está en la portería',
      ruta: '/mi/notificaciones',
    });
    expect(nuevos[0]?.ttl).toBe('900');
    expect(push.rechazos).toEqual([]);
  });

  it('a una vivienda de OTRA copropiedad no le llega nada, y la guardia lo lee', async () => {
    if (!disponible) return;
    const antes = push.recibidos.length;
    const res = await avisar(VIVIENDA_B, 'Prueba de aislamiento');
    expect(res.status).toBe(202);
    expect(res.body.detalle).toMatch(/no le llega a la app del residente/);
    expect(push.recibidos.length).toBe(antes);
  });

  it('un 410 del servicio retira la suscripción, con motivo, y no se vuelve a intentar', async () => {
    if (!disponible) return;
    push.responder(a.ruta, 410);
    const res = await avisar(VIVIENDA, 'Segundo aviso');
    expect(res.status).toBe(202);
    expect(res.body.detalle).toMatch(/no le llega a la app del residente/);
    expect(await estadoDe(a.endpoint)).toEqual({
      estado: 'inactivo',
      motivo: 'el servicio de push respondió 410',
    });
  });

  it('el residente quita los avisos de un navegador y ese navegador deja de recibirlos', async () => {
    if (!disponible) return;
    const s = push.suscribir(`b-${CORRIDA}`).cuerpo;
    const auth = `Bearer ${await comoResidente()}`;
    await request(servidor())
      .post(`/copropiedades/${COP_A}/mi/notificaciones/web-push`)
      .set('Authorization', auth)
      .send(s)
      .expect(201);
    const baja = await request(servidor())
      .post(`/copropiedades/${COP_A}/mi/notificaciones/web-push/baja`)
      .set('Authorization', auth)
      .send({ endpoint: s.endpoint })
      .expect(200);
    expect(baja.body).toEqual({ anulada: true });
    const antes = push.recibidos.length;
    expect((await avisar(VIVIENDA, 'Tercer aviso')).status).toBe(202);
    expect(push.recibidos.length).toBe(antes);
  });
});
