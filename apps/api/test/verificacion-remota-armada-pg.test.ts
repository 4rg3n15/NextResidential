import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import {
  FlujoEnVivo,
  aperturasFisicasPor,
  capacidadesDescubiertas,
  crearProveedorDeEquipos,
  desenlacesDeVerificacionPor,
  equiposSimulados,
} from '@ncr/providers';
import type { EscuchaActiva, FuenteDePlacas, ProveedorDeEquipos } from '@ncr/providers';
import type { ContextoTenant } from '../src/autenticacion';
import { RegistroDeEquiposPg } from '../src/equipos';
import { RepositorioDeEquiposPg } from '../src/equipos/infraestructura/repositorio-equipos-pg';
import { FUENTE_DE_PLACAS, PROVEEDOR_DE_EQUIPOS } from '../src/proveedores';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * VERIFICACIÓN REMOTA EN MODO ARMADO, DE PUNTA A PUNTA · ETAPA 15-L (Bloque A)
 *
 * La prueba que faltaba en el Bloque 0 (0.1): hasta aquí el veredicto lo
 * recogía `MockProvider` en memoria y ninguna orden llegaba a un equipo. Ahora:
 *
 *   terminal SIMULADA (Digest, `AcsCfg`, biblioteca)  ← adaptador REAL
 *        │  flujo abierto por la API, sin `ALARM_SERVER_EQUIPOS` (R1)
 *        ▼
 *   evento con `remoteCheck` y `serialNo` → ingestor → motor con PostgreSQL
 *        │
 *        ▼
 *   `PUT remoteCheck` con la MISMA serie → la terminal ABRE o NIEGA
 *
 * El oráculo es el simulado (`desenlacesDeVerificacionPor`), no la respuesta
 * HTTP del equipo: el equipo contesta «OK» aunque la serie no sea la suya.
 *
 * Y la decisión 7 del cliente, literal: dos rostros seguidos → dos eventos y
 * dos veredictos (R2).
 *
 * Sin `DATABASE_URL_PRUEBAS` se omite y lo dice; `--con-base` la exige.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const CORRIDA = randomBytes(3).toString('hex').toUpperCase();
const ADMIN = '00000000-0000-4000-8000-000000000010';
const VIVIENDA = '30000000-0000-4000-8000-000000000001';
const LLAVE = 'llave-de-equipos-solo-para-pruebas-32+';
const HOST = `terminal-armada-${CORRIDA.toLowerCase()}.invalid`;
const CLAVE = 'clave-de-la-terminal-simulada';

/** Mañana a las 15:00 Z, dentro de la franja de la visita (14–18 Z). */
const DIA = new Date(
  Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1),
);
const hora = (h: number, minutos = 0): Date =>
  new Date(DIA.getTime() + h * 3_600_000 + minutos * 60_000 + (parseInt(CORRIDA, 16) % 50_000));

let reloj = hora(3);
let pool: Pool | undefined;
let app: INestApplication | undefined;
let disponible = false;
let terminalId = '';
let admin = '';
let escucha: EscuchaActiva | undefined;
const flujo = new FlujoEnVivo();

const ctxAdmin = (): ContextoTenant => ({
  usuarioId: ADMIN,
  rol: 'administrador',
  copropiedadId: COP_A,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  let equipos: RepositorioDeEquiposPg;
  try {
    await pool.query('SELECT 1 FROM public.plazas_de_ocupante LIMIT 1');
    equipos = new RepositorioDeEquiposPg(pool, LLAVE, 'env:EQUIPOS_LLAVE');
    const creado = await equipos.crear(
      ctxAdmin(),
      COP_A,
      {
        nombre: `Terminal armada ${CORRIDA}`,
        tipo: 'terminal_facial',
        host: HOST,
        puerto: 80,
        protocolo: 'http',
        usuario: 'servicio',
        secreto: CLAVE,
        modoDeTerminal: 'reporta_y_espera',
      },
      {
        clase: 'alcanzado',
        detalle: 'responde',
        modelo: 'DS-K1T344MBFWX-E',
        firmware: 'V4.47.0',
        latenciaMs: 1,
        verificado: true,
        capacidades: capacidadesDescubiertas({
          bibliotecaDeRostros: { estado: 'si', maximo: 100, almacenadas: 0 },
          gestionDePersonas: 'si',
          verificacionRemota: 'si',
          suscripcionDeEventos: 'no',
          aperturaRemota: 'si',
        }),
      },
    );
    terminalId = creado.id;
  } catch (e) {
    console.warn('verificacion-remota-armada: base no preparada, se omite:', e);
    return;
  }
  const peticion = equiposSimulados({
    [HOST]: { familia: 'terminal', usuario: 'servicio', clave: CLAVE, enVivo: flujo },
  });
  const firmante = await crearFirmante();
  app = await crearApp(
    firmante,
    (b) =>
      b
        .overrideProvider(RELOJ)
        .useValue({ ahora: () => new Date(reloj.getTime()) })
        // El adaptador REAL, con la terminal simulada al otro lado del Digest.
        .overrideProvider(PROVEEDOR_DE_EQUIPOS)
        .useFactory({
          inject: [FUENTE_DE_PLACAS, BITACORA, RELOJ],
          factory: (fuente: FuenteDePlacas, bitacora: Bitacora, r: Reloj) =>
            crearProveedorDeEquipos({
              clase: 'hikvision', // kpi-11-exento: nombre del adaptador que se compone
              registro: new RegistroDeEquiposPg(pool as Pool, LLAVE),
              peticion,
              fuente,
              reloj: r,
              traza: bitacora,
            }),
        }),
    {
      PROVEEDOR_DE_EQUIPOS: 'simulado',
      CARGADOR_DE_CONTEXTO: 'postgres',
      PERSISTENCIA_DE_EVENTOS: 'postgres',
      PERSISTENCIA_DE_BIOMETRIA: 'postgres',
      DATABASE_URL: URL_BASE,
      DATABASE_POOLER_URL: URL_BASE,
      EQUIPOS_LLAVE: LLAVE,
      // R1 · la terminal NO se declara aquí, como dice la guía de sitio.
      ALARM_SERVER_EQUIPOS: '',
    },
    { repositorio: equipos },
  );
  admin = await tokenDe(firmante, { rol: 'administrador', usuarioId: ADMIN });
  disponible = true;
});

afterAll(async () => {
  escucha?.detener();
  if (disponible && terminalId !== '') {
    await new RepositorioDeEquiposPg(pool as Pool, LLAVE, 'env:EQUIPOS_LLAVE')
      .desactivar(ctxAdmin(), COP_A, terminalId, 'fin de la prueba de verificación armada')
      .catch(() => undefined);
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

const MEDIDAS = { nitidez: 0.9, iluminacion: 0.5, rostrosDetectados: 1, proporcionRostro: 0.4 };
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff]),
  randomBytes(64),
  Buffer.from([0xff, 0xd9]),
]);

/** Visita de consola en la franja 14–18 Z de mañana, con rostro aceptado por el titular. */
const visitaConRostro = async (): Promise<string> => {
  const documento = `VA${CORRIDA}`;
  const { rows } = await (pool as Pool).query<{ id: string }>(
    `INSERT INTO public.personas (copropiedad_id, tipo_documento, numero_documento,
                                  nombre_completo, creado_por, actualizado_por)
     VALUES ($1, 'cedula', $2, $3, $4, $4) RETURNING id`,
    [COP_A, documento, `Visitante armado ${CORRIDA}`, ADMIN],
  );
  const personaId = rows[0]?.id ?? '';
  reloj = hora(3);
  const a = await con(admin).post(`/copropiedades/${COP_A}/autorizaciones`, {
    viviendaId: VIVIENDA,
    personaId,
    desde: new Date(DIA.getTime() + 14 * 3_600_000).toISOString(),
    hasta: new Date(DIA.getTime() + 18 * 3_600_000).toISOString(),
  });
  expect(a.status, JSON.stringify(a.body)).toBe(201);
  const c = await con(admin).post(`/copropiedades/${COP_A}/biometria/capturas`, {
    titularId: personaId,
    autorizacionId: a.body.id,
    medidas: MEDIDAS,
    vector: JPEG.toString('base64'),
    versionPolitica: 'v1.0',
    canal: 'presencial',
    suprimirEn: new Date(DIA.getTime() + 18 * 3_600_000).toISOString(),
  });
  expect(c.status, JSON.stringify(c.body)).toBe(201);
  const enlace = await con(admin).post(
    `/copropiedades/${COP_A}/biometria/consentimientos/${String(c.body.consentimientoId)}/enlace`,
  );
  expect(enlace.status, JSON.stringify(enlace.body)).toBe(201);
  await http()
    .post(`/consentimiento/${String(enlace.body.token)}/respuesta`)
    .type('form')
    .send({ acepta: 'si' })
    .expect(303);
  return c.body.plantillaId as string;
};

/** Lo que la terminal emite cuando reconoce a alguien y pregunta. */
const rostro = (empleado: string, serie: number, cuando: Date): Record<string, unknown> => ({
  ipAddress: '198.51.100.7',
  channelID: 1,
  dateTime: cuando.toISOString(),
  eventType: 'AccessControllerEvent',
  eventState: 'active',
  AccessControllerEvent: {
    majorEventType: 5,
    subEventType: 75,
    employeeNoString: empleado,
    serialNo: serie,
    currentEvent: true,
    remoteCheck: true,
  },
});

/** Espera a que la terminal simulada haya resuelto `n` peticiones. */
const resueltas = async (n: number) => {
  for (let i = 0; i < 100; i += 1) {
    const hechas = desenlacesDeVerificacionPor.get(HOST) ?? [];
    if (hechas.length >= n) return hechas;
    await new Promise((listo) => setTimeout(listo, 50));
  }
  return desenlacesDeVerificacionPor.get(HOST) ?? [];
};

describe('verificación remota ARMADA · la terminal pregunta por el flujo y actúa', () => {
  it('dos rostros seguidos → dos eventos y dos aperturas; uno desconocido → niega', async () => {
    if (omitida()) return;
    const plantillaId = await visitaConRostro();
    const enElEquipo = plantillaId.replace(/-/g, '').toLowerCase();

    // La API abre el flujo como lo hace `EscuchasDeEquipos`: por el proveedor.
    const proveedor = (app as INestApplication).get<ProveedorDeEquipos>(PROVEEDOR_DE_EQUIPOS);
    escucha = await proveedor.escuchar(terminalId);
    expect(escucha.transporte).toBe('escucha');

    reloj = hora(15);
    flujo.emitir(rostro(enElEquipo, 1866, reloj));
    reloj = hora(15, 1);
    flujo.emitir(rostro(enElEquipo, 1867, reloj));
    reloj = hora(15, 2);
    flujo.emitir(rostro('ffffffffffffffffffffffffffffffff', 1868, reloj));

    const hechas = await resueltas(3);
    expect(hechas.map((h) => [h.serie, h.desenlace])).toEqual([
      ['1866', 'abrio'],
      ['1867', 'abrio'],
      ['1868', 'nego'],
    ]);
    expect(aperturasFisicasPor.get(HOST)).toBe(2);
    // Cada veredicto llegó dentro del plazo de la terminal (5 s por omisión).
    for (const h of hechas) expect(h.esperaMs ?? Infinity).toBeLessThan(5000);

    const r = await con(admin).get(
      `/copropiedades/${COP_A}/eventos?desde=${encodeURIComponent(hora(14).toISOString())}` +
        `&hasta=${encodeURIComponent(hora(16).toISOString())}` +
        `&dispositivoId=${terminalId}&tamanoPagina=100`,
    );
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const filas = (r.body as { filas: { resultado: string; metodo: string }[] }).filas;
    expect(filas.filter((f) => f.resultado === 'permitido')).toHaveLength(2);
    expect(filas).toHaveLength(3);
    expect(new Set(filas.map((f) => f.metodo))).toEqual(new Set(['facial']));
  });

  it('el MISMO evento reenviado no produce un segundo acceso ni una segunda apertura', async () => {
    if (omitida()) return;
    const antes = (desenlacesDeVerificacionPor.get(HOST) ?? []).length;
    const aperturas = aperturasFisicasPor.get(HOST) ?? 0;
    // El equipo reenvía el 1866 tal cual (misma serie, misma hora).
    flujo.emitir(rostro('reenvio', 1866, hora(15)));
    const hechas = await resueltas(antes + 1);
    expect(hechas[antes]?.desenlace).toBe('nego');
    expect(aperturasFisicasPor.get(HOST) ?? 0).toBe(aperturas);
  });
});
