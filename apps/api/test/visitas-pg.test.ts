import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { FACE_TEMPLATE_PROVIDER } from '@ncr/domain-core';
import type { FaceTemplateProvider } from '@ncr/domain-core';
import { capacidadesDescubiertas } from '@ncr/providers';
import type { ContextoTenant } from '../src/autenticacion';
import { RepositorioDeEquiposPg } from '../src/equipos/infraestructura/repositorio-equipos-pg';
import { CanalEnProceso } from '../src/eventos/infraestructura/canal-en-proceso';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * F (15-L) · «GENERAR AUTORIZACIÓN» CONTRA API + POSTGRESQL + EQUIPOS SIMULADOS
 *
 * El recorrido entero por HTTP, con los repositorios de producción:
 *   F1 · portería genera una visita con foto y casilla; sin casilla, o con una
 *        foto que no sirve, no se crea NADA;
 *   F2 · nace vigente y avisa en vivo; el portero la rechaza con motivo y la
 *        foto sale de los equipos en la misma llamada;
 *   F3 · la foto va a TODOS los equipos con rostros, y el que responde 400
 *        queda anotado como fallido, equipo por equipo;
 *   F4 · la casilla queda escrita en la autorización y el consentimiento
 *        nace con origen «declarado por quien registra»;
 *   F5 · portería ve SÓLO el día, aunque pida otra cosa;
 *   F6 · el residente genera, ve sus últimos visitantes y vuelve a autorizar
 *        con la foto copiada; la visita de otra vivienda no existe para él;
 *   F7 · administración filtra el historial por vivienda.
 *
 * Se OMITE —no falla— sin `DATABASE_URL_PRUEBAS`; el verificador lo cuenta.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const CORRIDA = randomBytes(3).toString('hex').toUpperCase();
const ADMIN = '00000000-0000-4000-8000-000000000010';
const PORTERO = '00000000-0000-4000-8000-000000000011';
const RESIDENTE = '00000000-0000-4000-8000-000000000013';
const SUPER = '00000000-0000-4000-8000-000000000002';
const VIVIENDA_CONSOLA = '30000000-0000-4000-8000-000000000001';
const VIVIENDA_DEL_RESIDENTE = '30000000-0000-4000-8000-000000000042';
const LLAVE_EQUIPOS = 'llave-de-equipos-solo-para-pruebas-32+';
const MINUTO = 60_000;

/**
 * El equipo que rechaza: la respuesta de la terminal real cuando el cuerpo no
 * le cuadra (H-SITIO, anexo 15-K) — un 400 con su `subStatusCode`.
 */
const RESPUESTA_400 = 'la terminal respondió 400 (badJsonContent)';

class TerminalesSimuladas implements FaceTemplateProvider {
  readonly recibidas: string[] = [];
  readonly retiradas: string[] = [];
  readonly rechazan = new Set<string>();
  async sincronizar(dispositivoId: string, plantillaId: string): Promise<void> {
    if (this.rechazan.has(dispositivoId)) throw new Error(RESPUESTA_400);
    this.recibidas.push(`${dispositivoId}/${plantillaId}`);
  }
  async suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    this.retiradas.push(`${dispositivoId}/${plantillaId}`);
  }
}

/** Un JPEG mínimo: los bytes de cabecera y de cierre que el tipo real exige. */
const jpeg = (): string =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    randomBytes(96),
    Buffer.from([0xff, 0xd9]),
  ]).toString('base64');

const MEDIDAS_BUENAS = {
  rostrosDetectados: 1,
  nitidez: 0.9,
  iluminacion: 0.6,
  proporcionRostro: 0.4,
};

let pool: Pool | undefined;
let app: INestApplication | undefined;
let disponible = false;
let equipos: RepositorioDeEquiposPg | undefined;
let terminalBuena = '';
let terminalQueRechaza = '';
const simuladas = new TerminalesSimuladas();
const enVivo: { tema: string; carga: unknown }[] = [];
let portero = '';
let admin = '';
let residente = '';
let superadmin = '';

const ctxAdmin = (): ContextoTenant => ({
  usuarioId: ADMIN,
  rol: 'administrador',
  copropiedadId: COP_A,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});

const alta = async (nombre: string): Promise<string> => {
  const creado = await (equipos as RepositorioDeEquiposPg).crear(
    ctxAdmin(),
    COP_A,
    {
      nombre,
      tipo: 'terminal_facial',
      host: `${nombre.toLowerCase().replace(/\s+/g, '-')}.invalid`,
      puerto: 80,
      protocolo: 'http',
      usuario: 'servicio',
      secreto: 'clave-de-pruebas-1',
    },
    {
      clase: 'alcanzado',
      detalle: 'responde',
      modelo: 'M',
      firmware: 'V0',
      latenciaMs: 1,
      verificado: true,
      capacidades: capacidadesDescubiertas({
        bibliotecaDeRostros: { estado: 'si', maximo: 100, almacenadas: 0 },
      }),
    },
  );
  return creado.id;
};

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    await pool.query('SELECT consentimiento_declarado_por FROM public.autorizaciones LIMIT 1');
    equipos = new RepositorioDeEquiposPg(pool, LLAVE_EQUIPOS, 'env:EQUIPOS_LLAVE');
    terminalBuena = await alta(`Terminal visitas ${CORRIDA}`);
    terminalQueRechaza = await alta(`Videoportero visitas ${CORRIDA}`);
    simuladas.rechazan.add(terminalQueRechaza);
  } catch (e) {
    console.warn('visitas-pg: base no preparada, se omite:', e);
    return;
  }
  const firmante = await crearFirmante();
  app = await crearApp(
    firmante,
    (b) => b.overrideProvider(FACE_TEMPLATE_PROVIDER).useValue(simuladas),
    {
      CARGADOR_DE_CONTEXTO: 'postgres',
      PERSISTENCIA_DE_EVENTOS: 'postgres',
      PERSISTENCIA_DE_BIOMETRIA: 'postgres',
      DATABASE_URL: URL_BASE,
      DATABASE_POOLER_URL: URL_BASE,
    },
    { repositorio: equipos },
  );
  app.get(CanalEnProceso).suscribir(COP_A, {
    entregar: (tema, carga) => {
      enVivo.push({ tema, carga });
      return true;
    },
  });
  portero = await tokenDe(firmante, { rol: 'portero', usuarioId: PORTERO });
  admin = await tokenDe(firmante, { rol: 'administrador', usuarioId: ADMIN });
  residente = await tokenDe(firmante, { rol: 'residente', usuarioId: RESIDENTE });
  superadmin = await tokenDe(firmante, {
    rol: 'superadministrador',
    usuarioId: SUPER,
    copropiedadId: null,
  });
  disponible = true;
});

afterAll(async () => {
  for (const id of [terminalBuena, terminalQueRechaza]) {
    if (disponible && equipos !== undefined && id !== '') {
      await equipos.desactivar(ctxAdmin(), COP_A, id, 'fin de la prueba de visitas');
    }
  }
  await app?.close();
  await pool?.end();
});

const omitida = (): boolean => {
  if (disponible) return false;
  console.log('OMITIDA: sin DATABASE_URL_PRUEBAS (se exige con --con-base).');
  return true;
};

const http = () => request((app as INestApplication).getHttpServer());
const con = (token: string) => ({
  get: (ruta: string) => http().get(ruta).set('Authorization', `Bearer ${token}`),
  post: (ruta: string, cuerpo: object = {}) =>
    http().post(ruta).set('Authorization', `Bearer ${token}`).send(cuerpo),
});
const fila = async <T extends Record<string, unknown>>(
  sql: string,
  parametros: readonly unknown[],
): Promise<T | undefined> => (await (pool as Pool).query<T>(sql, [...parametros])).rows[0];

const documento = (n: number): string => `9${CORRIDA.replace(/\D/g, '7')}${String(n)}`.slice(0, 12);

const visita = (n: number, extra: object = {}) => ({
  nombre: `Visitante ${CORRIDA} ${String(n)}`,
  tipoDocumento: 'cedula',
  documento: documento(n),
  viviendaId: VIVIENDA_CONSOLA,
  inicio: new Date(Date.now() - 5 * MINUTO).toISOString(),
  duracionMinutos: 120,
  foto: { contenidoBase64: jpeg(), tipoMime: 'image/jpeg', medidas: MEDIDAS_BUENAS },
  casillaMarcada: true,
  ...extra,
});

/** La misma visita, como la envía la app: sin vivienda ni tipo de documento. */
const visitaDeLaApp = (n: number, extra: object = {}) => ({
  nombre: `Visitante ${CORRIDA} ${String(n)}`,
  documento: documento(n),
  inicio: new Date(Date.now() - 5 * MINUTO).toISOString(),
  duracionMinutos: 120,
  foto: { contenidoBase64: jpeg(), tipoMime: 'image/jpeg', medidas: MEDIDAS_BUENAS },
  casillaMarcada: true,
  claveDeIdempotencia: `visita-${CORRIDA}-${randomUUID()}`,
  ...extra,
});

/**
 * Autorizaciones de la persona de ESE documento. Por persona y no el total de
 * la copropiedad: otras suites crean autorizaciones a la vez y el total no
 * diría nada de lo que hizo esta petición.
 */
const cuantas = async (n: number): Promise<number> =>
  Number(
    (
      await fila<{ n: string }>(
        `SELECT count(*) AS n FROM public.autorizaciones a
           JOIN public.visitantes v ON v.id = a.visitante_id
           JOIN public.personas p ON p.id = v.persona_id
          WHERE a.copropiedad_id = $1 AND p.numero_documento = app.normalizar_documento($2)`,
        [COP_A, documento(n)],
      )
    )?.n ?? 0,
  );

let generada = '';

describe('F1 · generar autorización desde la consola', () => {
  it('sin la casilla no se crea nada', async () => {
    if (omitida()) return;
    const r = await con(portero).post(
      `/copropiedades/${COP_A}/visitas`,
      visita(1, { casillaMarcada: false }),
    );
    expect(r.status).toBe(422);
    expect(await cuantas(1)).toBe(0);
  });

  it('una foto con dos rostros no sirve, y tampoco se crea nada', async () => {
    if (omitida()) return;
    const r = await con(portero).post(
      `/copropiedades/${COP_A}/visitas`,
      visita(2, {
        foto: {
          contenidoBase64: jpeg(),
          tipoMime: 'image/jpeg',
          medidas: { ...MEDIDAS_BUENAS, rostrosDetectados: 2 },
        },
      }),
    );
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ generada: false });
    expect(r.body.motivosDeFoto.length).toBeGreaterThan(0);
    expect(await cuantas(2)).toBe(0);
  });

  it('un archivo que no es la imagen que dice ser se rechaza', async () => {
    if (omitida()) return;
    const r = await con(portero).post(
      `/copropiedades/${COP_A}/visitas`,
      visita(3, {
        foto: {
          contenidoBase64: Buffer.from('no-soy-una-foto-de-verdad').toString('base64'),
          tipoMime: 'image/jpeg',
          medidas: MEDIDAS_BUENAS,
        },
      }),
    );
    expect(r.status).toBe(422);
  });

  it('F2/F3/F4 · el portero la genera: nace vigente, va a todos los equipos y deja la casilla', async () => {
    if (omitida()) return;
    enVivo.length = 0;
    const r = await con(portero).post(`/copropiedades/${COP_A}/visitas`, visita(4));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ generada: true });
    generada = r.body.autorizacionId as string;

    // F3 · los dos equipos de la corrida: uno la aceptó, el otro respondió 400.
    const nuestros = (
      r.body.porEquipo as { dispositivoId: string; sincronizada: boolean }[]
    ).filter((e) => [terminalBuena, terminalQueRechaza].includes(e.dispositivoId));
    expect(nuestros).toHaveLength(2);
    expect(nuestros.find((e) => e.dispositivoId === terminalBuena)?.sincronizada).toBe(true);
    expect(nuestros.find((e) => e.dispositivoId === terminalQueRechaza)?.sincronizada).toBe(false);

    // F4 · la casilla en la autorización, y el consentimiento declarado.
    const a = await fila<{
      estado: string;
      por: string;
      version: string;
      foto: string | null;
    }>(
      `SELECT estado::text, consentimiento_declarado_por AS por,
              consentimiento_texto_version AS version, evidencia_foto_id AS foto
         FROM public.autorizaciones WHERE id = $1`,
      [generada],
    );
    expect(a).toMatchObject({ estado: 'activa', por: PORTERO });
    expect(a?.version).toMatch(/^casilla-/);
    expect(a?.foto).not.toBeNull();
    const c = await fila<{ origen: string; declarado_por: string; estado: string; canal: string }>(
      `SELECT c.origen, c.declarado_por, c.estado::text, c.canal::text
         FROM public.plantillas_biometricas p
         JOIN public.consentimientos_biometricos c ON c.id = p.consentimiento_id
        WHERE p.autorizacion_id = $1`,
      [generada],
    );
    expect(c).toMatchObject({
      origen: 'declarado_por_quien_registra',
      declarado_por: PORTERO,
      estado: 'vigente',
      canal: 'presencial',
    });

    // F2 · el aviso en vivo, con la visita tal como se lista.
    const aviso = enVivo.find((m) => m.tema === 'visitas');
    expect(aviso?.carga).toMatchObject({
      tipo: 'nueva',
      visita: { autorizacionId: generada, estado: 'vigente' },
    });
  });

  it('F3 · la consola ve la foto equipo por equipo, con el motivo del que falló', async () => {
    if (omitida()) return;
    const r = await con(admin).get(`/copropiedades/${COP_A}/visitas/${generada}/equipos`);
    expect(r.status).toBe(200);
    const porEquipo = Object.fromEntries(
      (r.body as { dispositivoId: string; estado: string; detalle: string | null }[]).map((e) => [
        e.dispositivoId,
        e,
      ]),
    );
    expect(porEquipo[terminalBuena]).toMatchObject({ estado: 'sincronizada' });
    expect(porEquipo[terminalQueRechaza]).toMatchObject({ estado: 'fallida' });
    expect(porEquipo[terminalQueRechaza]?.detalle).toContain('400');
  });
});

describe('F5 y F7 · la lista', () => {
  let manana = '';

  it('una visita de pasado mañana existe para administración', async () => {
    if (omitida()) return;
    const r = await con(admin).post(
      `/copropiedades/${COP_A}/visitas`,
      visita(5, { inicio: new Date(Date.now() + 2 * 86_400_000).toISOString() }),
    );
    expect(r.status).toBe(201);
    manana = r.body.autorizacionId as string;
  });

  it('portería ve SÓLO el día, aunque pida otra vivienda u otras fechas', async () => {
    if (omitida()) return;
    const r = await con(portero).get(
      `/copropiedades/${COP_A}/visitas?viviendaId=${VIVIENDA_DEL_RESIDENTE}&desde=2020-01-01T00:00:00Z`,
    );
    expect(r.status).toBe(200);
    expect(r.body.soloElDia).toBe(true);
    const ids = (r.body.visitas as { autorizacionId: string }[]).map((v) => v.autorizacionId);
    expect(ids).toContain(generada);
    expect(ids).not.toContain(manana);
    // El día es [00:00, 24:00) de Bogotá: veinticuatro horas exactas.
    expect(new Date(r.body.hasta).getTime() - new Date(r.body.desde).getTime()).toBe(86_400_000);
  });

  it('administración filtra el historial por vivienda y por texto', async () => {
    if (omitida()) return;
    const r = await con(superadmin).get(
      `/copropiedades/${COP_A}/visitas?viviendaId=${VIVIENDA_CONSOLA}&texto=${encodeURIComponent(`Visitante ${CORRIDA}`)}`,
    );
    expect(r.status).toBe(200);
    expect(r.body.soloElDia).toBe(false);
    const ids = (r.body.visitas as { autorizacionId: string; vivienda: string }[]).map(
      (v) => v.autorizacionId,
    );
    expect(ids).toEqual(expect.arrayContaining([generada, manana]));
    const otra = await con(superadmin).get(
      `/copropiedades/${COP_A}/visitas?viviendaId=${VIVIENDA_DEL_RESIDENTE}&texto=${encodeURIComponent(`Visitante ${CORRIDA}`)}`,
    );
    expect((otra.body.visitas as unknown[]).length).toBe(0);
  });

  it('las viviendas para el formulario las ve también portería', async () => {
    if (omitida()) return;
    const r = await con(portero).get(`/copropiedades/${COP_A}/visitas/viviendas`);
    expect(r.status).toBe(200);
    expect((r.body as { id: string }[]).map((v) => v.id)).toContain(VIVIENDA_CONSOLA);
  });
});

describe('F2 · rechazo', () => {
  it('administración no rechaza: sólo portería y superadministración', async () => {
    if (omitida()) return;
    const r = await con(admin).post(`/copropiedades/${COP_A}/visitas/${generada}/rechazo`, {
      motivo: 'no la conozco',
    });
    expect(r.status).toBe(403);
  });

  it('el portero la rechaza: queda anulada con motivo y la foto sale de los equipos', async () => {
    if (omitida()) return;
    enVivo.length = 0;
    const r = await con(portero).post(`/copropiedades/${COP_A}/visitas/${generada}/rechazo`, {
      motivo: 'El residente dice que no espera a nadie',
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ equiposPendientes: 0 });
    expect(r.body.equiposRetirados).toBeGreaterThanOrEqual(1);

    const a = await fila<{ estado: string; motivo: string }>(
      `SELECT estado::text, motivo_revocacion AS motivo FROM public.autorizaciones WHERE id = $1`,
      [generada],
    );
    expect(a).toMatchObject({
      estado: 'revocada',
      motivo: 'El residente dice que no espera a nadie',
    });
    const p = await fila<{ estado: string; vector: Buffer | null; id: string }>(
      `SELECT id, estado::text, vector_cifrado AS vector FROM public.plantillas_biometricas
        WHERE autorizacion_id = $1`,
      [generada],
    );
    expect(p).toMatchObject({ estado: 'suprimida', vector: null });
    expect(simuladas.retiradas).toContain(`${terminalBuena}/${String(p?.id)}`);
    expect(enVivo.find((m) => m.tema === 'visitas')?.carga).toMatchObject({
      tipo: 'anulada',
      visita: { autorizacionId: generada, estado: 'anulada' },
    });
  });

  it('en la lista aparece anulada, con su motivo', async () => {
    if (omitida()) return;
    const r = await con(portero).get(`/copropiedades/${COP_A}/visitas`);
    const v = (
      r.body.visitas as { autorizacionId: string; estado: string; motivoAnulacion: string }[]
    ).find((x) => x.autorizacionId === generada);
    expect(v).toMatchObject({
      estado: 'anulada',
      motivoAnulacion: 'El residente dice que no espera a nadie',
    });
  });
});

describe('F6 · el residente', () => {
  let suya = '';

  it('genera su visita con foto y casilla, sin elegir vivienda', async () => {
    if (omitida()) return;
    const r = await con(residente).post(`/copropiedades/${COP_A}/mi/visitas`, visitaDeLaApp(6));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ creada: true, repetida: false });
    suya = r.body.id as string;
    const a = await fila<{ vivienda: string; por: string; canal: string }>(
      `SELECT a.vivienda_id AS vivienda, a.consentimiento_declarado_por AS por, c.canal::text AS canal
         FROM public.autorizaciones a
         JOIN public.plantillas_biometricas p ON p.autorizacion_id = a.id
         JOIN public.consentimientos_biometricos c ON c.id = p.consentimiento_id
        WHERE a.id = $1`,
      [suya],
    );
    expect(a).toMatchObject({ vivienda: VIVIENDA_DEL_RESIDENTE, por: RESIDENTE, canal: 'app' });
  });

  it('sin la casilla, tampoco en la app', async () => {
    if (omitida()) return;
    const r = await con(residente).post(
      `/copropiedades/${COP_A}/mi/visitas`,
      visitaDeLaApp(7, { casillaMarcada: false }),
    );
    expect(r.status).toBe(422);
  });

  it('ve sus últimos visitantes, y sólo los de su vivienda', async () => {
    if (omitida()) return;
    const r = await con(residente).get(`/copropiedades/${COP_A}/mi/visitas/ultimas`);
    expect(r.status).toBe(200);
    const ids = (r.body as { autorizacionId: string }[]).map((v) => v.autorizacionId);
    expect(ids).toContain(suya);
    expect(ids).not.toContain(generada);
  });

  it('vuelve a autorizar: sólo cuándo y cuánto, y la foto se copia', async () => {
    if (omitida()) return;
    const r = await con(residente).post(`/copropiedades/${COP_A}/mi/visitas/${suya}/repeticion`, {
      inicio: new Date(Date.now() + 86_400_000).toISOString(),
      duracionMinutos: 60,
      casillaMarcada: true,
      claveDeIdempotencia: `repite-${CORRIDA}-${randomUUID()}`,
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ creada: true });
    const nueva = r.body.id as string;
    expect(nueva).not.toBe(suya);
    const dos = await fila<{ mismas: boolean; con_foto: boolean; calidad_igual: boolean }>(
      `SELECT (SELECT v.persona_id FROM public.visitantes v WHERE v.id = a.visitante_id)
                = (SELECT v.persona_id FROM public.visitantes v WHERE v.id = b.visitante_id) AS mismas,
              b.evidencia_foto_id IS NOT NULL AS con_foto,
              (SELECT calidad FROM public.plantillas_biometricas WHERE autorizacion_id = a.id)
                = (SELECT calidad FROM public.plantillas_biometricas WHERE autorizacion_id = b.id)
                AS calidad_igual
         FROM public.autorizaciones a, public.autorizaciones b
        WHERE a.id = $1 AND b.id = $2`,
      [suya, nueva],
    );
    expect(dos).toMatchObject({ mismas: true, con_foto: true, calidad_igual: true });
  });

  it('no puede volver a autorizar la visita de otra vivienda', async () => {
    if (omitida()) return;
    const r = await con(residente).post(
      `/copropiedades/${COP_A}/mi/visitas/${generada}/repeticion`,
      {
        inicio: new Date(Date.now() + 86_400_000).toISOString(),
        duracionMinutos: 60,
        casillaMarcada: true,
        claveDeIdempotencia: `repite-${CORRIDA}-${randomUUID()}`,
      },
    );
    expect(r.status).toBe(404);
  });
});
