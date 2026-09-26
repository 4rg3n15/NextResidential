import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { FACE_TEMPLATE_PROVIDER, RELOJ } from '@ncr/domain-core';
import { capacidadesDescubiertas, sobreDeLectura } from '@ncr/providers';
import type { MockProvider } from '@ncr/providers';
import type { ContextoTenant } from '../src/autenticacion';
import { RepositorioDeEquiposPg } from '../src/equipos/infraestructura/repositorio-equipos-pg';
import { CanalEnProceso } from '../src/eventos/infraestructura/canal-en-proceso';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ENSAYO PREVIO EN SITIO · ETAPA 15-I, punto 6 · **SIMULADO**
 *
 * Los escenarios de `docs/guias/ENSAYO_PREVIO_EN_SITIO.md`, recorridos por HTTP
 * contra la base REAL con `PROVEEDOR_DE_EQUIPOS=simulado`,
 * `CARGADOR_DE_CONTEXTO=postgres` y la persistencia en PostgreSQL. Cada uno se
 * lanza por el CANAL por el que se lanzará en sitio: la autorización o la foto
 * salen de la ruta de la APP (`/mi/…`, token de residente) o de la de la
 * CONSOLA (token de administración), y la decisión sale del motor real, que lee
 * lo que esas rutas escribieron.
 *
 * NO es verificación de hardware: el equipo al otro lado es el simulado. Lo
 * que demuestra es que, cuando el aparato publique, todo lo que está detrás
 * decide lo que tiene que decidir. El reloj es el de la API (RELOJ), fijado por
 * escenario; la cámara publica con ese mismo instante.
 *
 * Sin `DATABASE_URL_PRUEBAS` se omite y lo dice; `--con-base` la exige.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const CORRIDA = randomBytes(3).toString('hex').toUpperCase();
const ADMIN = '00000000-0000-4000-8000-000000000010';
const OPERADOR = '00000000-0000-4000-8000-000000000012';
const RESIDENTE = '00000000-0000-4000-8000-000000000013';
const VIVIENDA_CONSOLA = '30000000-0000-4000-8000-000000000001';
const LPR = '90000000-0000-4000-8000-000000000001';
const INTERCOM = '90000000-0000-4000-8000-000000000004';
const S_LPR = `lpr-${'a'.repeat(40)}`;
const S_TERMINAL = `terminal-${'b'.repeat(40)}`;
const S_INTERCOM = `intercom-${'c'.repeat(40)}`;
const LLAVE_EQUIPOS = 'llave-de-equipos-solo-para-pruebas-32+';

/** Mañana en UTC: la franja de las visitas es 14:00–18:00 Z de ese día. */
const DIA = new Date(
  Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1),
);
/**
 * Un desfase propio de la corrida (0–59 min y unos segundos): corridas
 * repetidas el mismo día no comparten instante, y la consulta de cada escenario
 * no se mezcla con los eventos de la anterior. La franja 14–18 lo admite.
 */
const DESFASE_MS =
  (parseInt(CORRIDA.slice(0, 2), 16) % 60) * 60_000 +
  (parseInt(CORRIDA.slice(2, 4), 16) % 60) * 1000;
const a = (horas: number, dias = 0): Date =>
  new Date(DIA.getTime() + dias * 86_400_000 + horas * 3_600_000 + DESFASE_MS);
const franja = (horas: number): Date => new Date(DIA.getTime() + horas * 3_600_000);
const FRANJA = { desde: franja(14).toISOString(), hasta: franja(18).toISOString() };

let reloj = a(-12);
let pool: Pool | undefined;
let app: INestApplication | undefined;
let disponible = false;
let equipos: RepositorioDeEquiposPg | undefined;
let terminalId = '';
let mock: MockProvider;
let admin = '';
let residente = '';
let operador = '';

/** Lo obtenido, escenario por escenario: el informe lo copia al documento. */
export const OBTENIDO: { escenario: string; canal: string; obtenido: string }[] = [];
const anotar = (escenario: string, canal: string, obtenido: string): void => {
  OBTENIDO.push({ escenario, canal, obtenido });
};

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
  try {
    await pool.query('SELECT 1 FROM public.plazas_de_ocupante LIMIT 1');
    equipos = new RepositorioDeEquiposPg(pool, LLAVE_EQUIPOS, 'env:EQUIPOS_LLAVE');
    const creado = await equipos.crear(
      ctxAdmin(),
      COP_A,
      {
        nombre: `Terminal ensayo ${CORRIDA}`,
        tipo: 'terminal_facial',
        host: `terminal-${CORRIDA}.invalid`,
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
    terminalId = creado.id;
  } catch (e) {
    console.warn('ensayo-en-sitio: base no preparada, se omite:', e);
    return;
  }
  const firmante = await crearFirmante();
  app = await crearApp(
    firmante,
    (b) => b.overrideProvider(RELOJ).useValue({ ahora: () => new Date(reloj.getTime()) }),
    {
      PROVEEDOR_DE_EQUIPOS: 'simulado',
      CARGADOR_DE_CONTEXTO: 'postgres',
      PERSISTENCIA_DE_EVENTOS: 'postgres',
      PERSISTENCIA_DE_BIOMETRIA: 'postgres',
      DATABASE_URL: URL_BASE,
      DATABASE_POOLER_URL: URL_BASE,
      ALARM_SERVER_EQUIPOS: [
        [LPR, S_LPR],
        [terminalId, S_TERMINAL],
        [INTERCOM, S_INTERCOM],
      ]
        .map(([d, s]) => `${COP_A}|${String(d)}|${String(s)}|127.0.0.1,::1`)
        .join(';'),
    },
    { repositorio: equipos },
  );
  mock = app.get(FACE_TEMPLATE_PROVIDER);
  // El simulado sólo conoce sus dos equipos de fábrica: se le declaran los del
  // ensayo, que es lo que en sitio hace el registro desde la consola.
  const conocidos = (mock as unknown as { dispositivos: Set<string> }).dispositivos;
  for (const d of [LPR, terminalId, INTERCOM]) conocidos.add(d);
  admin = await tokenDe(firmante, { rol: 'administrador', usuarioId: ADMIN });
  residente = await tokenDe(firmante, { rol: 'residente', usuarioId: RESIDENTE });
  operador = await tokenDe(firmante, {
    rol: 'operador_central',
    usuarioId: OPERADOR,
    copropiedadId: null,
    copropiedades: [COP_A],
  });
  disponible = true;
});

afterAll(async () => {
  if (disponible && equipos !== undefined && terminalId !== '') {
    await equipos.desactivar(ctxAdmin(), COP_A, terminalId, 'fin del ensayo en sitio');
  }
  // Los vetos del ensayo se levantan: la siguiente corrida parte de cero.
  await pool
    ?.query(
      `UPDATE public.listas_negras SET estado = 'levantada', levantada_en = now(),
              levantada_por = $2, actualizado_por = $2,
              motivo_levantamiento = 'fin del ensayo en sitio'
        WHERE copropiedad_id = $1 AND estado = 'activa' AND motivo LIKE $3`,
      [COP_A, ADMIN, `ensayo ${CORRIDA}%`],
    )
    .catch(() => undefined);
  await app?.close();
  await pool?.end();
  if (OBTENIDO.length > 0) console.log(`ENSAYO-EN-SITIO ${JSON.stringify(OBTENIDO)}`);
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

let serie = 0;
/** La cámara publica una lectura con el instante del reloj de la API. */
const leerPlaca = async (placa: string, confianza = 95): Promise<void> => {
  serie += 1;
  const s = sobreDeLectura({
    placa,
    confianza,
    referencia: `ensayo-${CORRIDA}-${String(serie)}`,
    ocurridoEn: reloj,
  });
  await http()
    .post(`/alarm-server/${S_LPR}`)
    .set('content-type', s.tipoDeContenido)
    .send(s.cuerpo)
    .expect(200);
};

/** La terminal pide el veredicto remoto por una plantilla que reconoció. */
const presentarRostro = async (plantillaId: string): Promise<boolean | undefined> => {
  serie += 1;
  const antes = mock.veredictos.length;
  await http()
    .post(`/alarm-server/${S_TERMINAL}`)
    .set('content-type', 'application/json')
    .send(
      JSON.stringify({
        eventType: 'AccessControllerEvent',
        dateTime: reloj.toISOString(),
        alarmDataType: 0,
        AccessControllerEvent: {
          employeeNoString: plantillaId,
          remoteCheck: true,
          serialNo: 10_000 + serie,
        },
      }),
    )
    .expect(200);
  return mock.veredictos.slice(antes).find((v) => v.dispositivoId === terminalId)?.veredicto
    .permitido;
};

interface Fila {
  readonly resultado: string;
  readonly motivo: string | null;
  readonly placaDetectada: string | null;
  readonly metodo: string;
  readonly ocurridoEn: string;
}

/** El último evento del equipo en el instante del reloj: lo que ve la consola. */
const ultimoEvento = async (dispositivoId: string, placa?: string): Promise<Fila | undefined> => {
  const r = await con(admin).get(
    `/copropiedades/${COP_A}/eventos?desde=${encodeURIComponent(
      new Date(reloj.getTime() - 5_000).toISOString(),
    )}&hasta=${encodeURIComponent(new Date(reloj.getTime() + 5_000).toISOString())}&dispositivoId=${dispositivoId}&tamanoPagina=100`,
  );
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const filas = (r.body as { filas: Fila[] }).filas;
  return filas.find((f) => placa === undefined || f.placaDetectada === placa);
};

const motivoDe = (f: Fila | undefined): string =>
  f === undefined ? 'SIN EVENTO' : f.resultado === 'permitido' ? 'PERMITIDO' : (f.motivo ?? '—');

/** Una persona visitante de ESTA corrida, para las autorizaciones de consola. */
const personaDeConsola = async (n: string): Promise<{ id: string; documento: string }> => {
  const documento = `EN${CORRIDA}${n}`;
  const { rows } = await (pool as Pool).query<{ id: string }>(
    `INSERT INTO public.personas (copropiedad_id, tipo_documento, numero_documento,
                                  nombre_completo, creado_por, actualizado_por)
     VALUES ($1, 'cedula', $2, $3, $4, $4) RETURNING id`,
    [COP_A, documento, `Visitante consola ${n}`, ADMIN],
  );
  return { id: rows[0]?.id ?? '', documento };
};

/** Crea la visita de un TERCERO con día y franja por el canal indicado. */
const visita = async (
  canal: 'app' | 'consola',
  placa: string | null,
  n: string,
): Promise<{ autorizacionId: string; personaId: string | null; documento: string }> => {
  reloj = a(-12);
  if (canal === 'app') {
    const documento = `AP${CORRIDA}${n}`;
    const r = await con(residente).post(`/copropiedades/${COP_A}/mi/autorizaciones`, {
      visitante: `Tercero app ${n}`,
      documento,
      ...FRANJA,
      ...(placa === null ? {} : { placa, permiteAccesoVehicular: true }),
      claveDeIdempotencia: `ensayo-${CORRIDA}-${n}`,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.creada, JSON.stringify(r.body)).toBe(true);
    return { autorizacionId: r.body.id as string, personaId: null, documento };
  }
  const p = await personaDeConsola(n);
  const r = await con(admin).post(`/copropiedades/${COP_A}/autorizaciones`, {
    viviendaId: VIVIENDA_CONSOLA,
    personaId: p.id,
    ...FRANJA,
    ...(placa === null ? {} : { placa }),
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return { autorizacionId: r.body.id as string, personaId: p.id, documento: p.documento };
};

/**
 * Las órdenes manuales no dependen de la hora del escenario, y `ordenes_manuales`
 * es de solo inserción: escribirlas con la fecha de mañana dejaría filas «del
 * futuro» que desplazan a las de otras suites en «las últimas N».
 */
const ordenAHoraReal = (): void => {
  reloj = new Date();
};

const vetar = async (cuerpo: { placa?: string; documento?: string }): Promise<void> => {
  const r = await con(admin).post(`/copropiedades/${COP_A}/listas-negras`, {
    ...cuerpo,
    motivo: `ensayo ${CORRIDA} · lista negra con autorización vigente`,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
};

const MEDIDAS = { nitidez: 0.9, iluminacion: 0.5, rostrosDetectados: 1, proporcionRostro: 0.4 };
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff]),
  randomBytes(64),
  Buffer.from([0xff, 0xd9]),
]);

/**
 * CU-02 completo por el canal: captura → enlace del VISITANTE → acepta él →
 * sincronización a la terminal, comprobada por el contador de su biblioteca.
 */
const enrolar = async (
  canal: 'app' | 'consola',
  v: { autorizacionId: string; personaId: string | null },
): Promise<string> => {
  // RN-11 · la plantilla vive lo que la visita: como la app desde la 15-I.
  const suprimirEn = franja(18).toISOString();
  let plantillaId = '';
  let token = '';
  if (canal === 'app') {
    const r = await con(residente).post(
      `/copropiedades/${COP_A}/mi/autorizaciones/${v.autorizacionId}/rostro`,
      { vector: JPEG.toString('base64'), medidas: MEDIDAS, versionPolitica: 'v1.0', suprimirEn },
    );
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.aceptada).toBe(true);
    plantillaId = r.body.plantillaId as string;
    token = String(r.body.enlaceDeConsentimiento).split('/').pop() ?? '';
  } else {
    const r = await con(admin).post(`/copropiedades/${COP_A}/biometria/capturas`, {
      titularId: v.personaId,
      autorizacionId: v.autorizacionId,
      medidas: MEDIDAS,
      vector: JPEG.toString('base64'),
      versionPolitica: 'v1.0',
      canal: 'presencial',
      suprimirEn,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    plantillaId = r.body.plantillaId as string;
    const enlace = await con(admin).post(
      `/copropiedades/${COP_A}/biometria/consentimientos/${String(r.body.consentimientoId)}/enlace`,
    );
    expect(enlace.status, JSON.stringify(enlace.body)).toBe(201);
    token = enlace.body.token as string;
  }
  // Antes de que el visitante responda, nada llega a la terminal (RN-09).
  expect(mock.plantillas.get(terminalId)?.has(plantillaId) ?? false).toBe(false);
  await http()
    .post(`/consentimiento/${token}/respuesta`)
    .type('form')
    .send({ acepta: 'si' })
    .expect(303);
  expect(mock.plantillas.get(terminalId)?.has(plantillaId)).toBe(true);
  return plantillaId;
};

describe('ENSAYO SIMULADO · cámara LPR con vehículo de TERCERO (día y franja)', () => {
  for (const canal of ['app', 'consola'] as const) {
    it(`L1–L5 por ${canal}: permitido · desconocida · hora fuera · día distinto · lista negra`, async () => {
      if (omitida()) return;
      const sufijo = canal === 'app' ? 'A' : 'C';
      const placa = `T${sufijo}${CORRIDA.slice(0, 4)}`;
      await visita(canal, placa, `${sufijo}L1`);

      reloj = a(15);
      await leerPlaca(placa);
      const l1 = await ultimoEvento(LPR, placa);
      anotar('L1', canal, motivoDe(l1));
      expect(motivoDe(l1)).toBe('PERMITIDO');
      expect(mock.aperturas.some((x) => x.dispositivoId === LPR)).toBe(true);

      const desconocida = `Z${sufijo}${CORRIDA.slice(0, 4)}`;
      await leerPlaca(desconocida);
      const l2 = await ultimoEvento(LPR, desconocida);
      anotar('L2', canal, motivoDe(l2));
      expect(motivoDe(l2)).toBe('PLACA_DESCONOCIDA');

      reloj = a(10);
      await leerPlaca(placa);
      const l3 = await ultimoEvento(LPR, placa);
      anotar('L3', canal, motivoDe(l3));
      expect(motivoDe(l3)).toBe('VIGENCIA_EXPIRADA');

      reloj = a(15, 1);
      await leerPlaca(placa);
      const l4 = await ultimoEvento(LPR, placa);
      anotar('L4', canal, motivoDe(l4));
      expect(motivoDe(l4)).toBe('VIGENCIA_EXPIRADA');

      const vetada = `N${sufijo}${CORRIDA.slice(0, 4)}`;
      await visita(canal, vetada, `${sufijo}L5`);
      await vetar({ placa: vetada });
      reloj = a(15);
      await leerPlaca(vetada);
      const l5 = await ultimoEvento(LPR, vetada);
      anotar('L5', canal, motivoDe(l5));
      // RN-06 · la lista negra manda sobre la autorización vigente (CA-13).
      expect(motivoDe(l5)).toBe('LISTA_NEGRA');
    });
  }

  it('L6 · un vehículo PROPIO registrado desde la app pasa a cualquier hora (D5 a)', async () => {
    if (omitida()) return;
    reloj = a(-12);
    const placa = `P${CORRIDA.slice(0, 5)}`;
    const ocupantes = await (pool as Pool).query<{ id: string }>(
      `SELECT r.id FROM public.residentes r JOIN public.usuarios u ON u.persona_id = r.persona_id
        WHERE u.id = $1 AND r.estado = 'activo' LIMIT 1`,
      [RESIDENTE],
    );
    const r = await con(residente).post(`/copropiedades/${COP_A}/mi/vehiculos`, {
      placa,
      color: 'Gris',
      modelo: '2020',
      tipo: 'automovil',
      ocupantes: [ocupantes.rows[0]?.id],
    });
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    const registrado = r.body.registrado === true;
    // Si la vivienda de la semilla ya agotó su cupo en otra corrida, el tope
    // es lo que contesta (D5 a), y eso también es el comportamiento pedido.
    if (!registrado) {
      expect(r.body.motivo).toBe('TOPE_ALCANZADO');
      anotar('L6', 'app', 'TOPE_ALCANZADO (cupo agotado por corridas previas)');
      return;
    }
    reloj = a(3);
    await leerPlaca(placa);
    const l6 = await ultimoEvento(LPR, placa);
    anotar('L6', 'app', motivoDe(l6));
    expect(motivoDe(l6)).toBe('PERMITIDO');
    await con(residente)
      .post(`/copropiedades/${COP_A}/mi/vehiculos/${String(r.body.id)}/desactivacion`)
      .expect(200);
  });

  it('L7 · baja confianza: inservible se niega; DUDOSA no abre sola y la abre la portería con motivo', async () => {
    if (omitida()) return;
    const placa = `B${CORRIDA.slice(0, 5)}`;
    await visita('consola', placa, 'BL7');
    // Por debajo de la mitad del umbral (P-02: 80): inservible.
    reloj = a(15);
    await leerPlaca(placa, 30);
    const inservible = await ultimoEvento(LPR, placa);
    anotar('L7', 'consola', `confianza 30 → ${motivoDe(inservible)}`);
    expect(motivoDe(inservible)).toBe('CONFIANZA_INSUFICIENTE');

    // Entre la mitad y el umbral: DUDOSA. El motor identifica, pero la barrera
    // NO se acciona sola (H-15I-09); la abre una persona con motivo (CA-16).
    reloj = new Date(a(15).getTime() + 5 * 60_000);
    const antes = mock.aperturas.length;
    await leerPlaca(placa, 60);
    expect(mock.aperturas.slice(antes).some((x) => x.dispositivoId === LPR)).toBe(false);
    ordenAHoraReal();
    const manual = await con(operador).post(`/copropiedades/${COP_A}/guardia/ordenes`, {
      dispositivoId: LPR,
      accion: 'abrir',
      motivo: `Ensayo ${CORRIDA}: placa sucia confirmada a la vista`,
    });
    expect(manual.status, JSON.stringify(manual.body)).toBe(201);
    const abierta = mock.aperturas.slice(antes).find((x) => x.dispositivoId === LPR);
    anotar(
      'L7',
      'consola',
      `confianza 60 → sin apertura automática; abierta a mano por ${String(abierta?.actorId)}`,
    );
    expect(abierta?.actorId).toBe(OPERADOR);
  });
});

describe('ENSAYO SIMULADO · terminal facial: captura → consentimiento del VISITANTE → contador → verificación remota', () => {
  for (const canal of ['app', 'consola'] as const) {
    it(`T1–T5 por ${canal}`, async () => {
      if (omitida()) return;
      const sufijo = canal === 'app' ? 'A' : 'C';
      const v = await visita(canal, null, `${sufijo}T1`);
      const plantilla = await enrolar(canal, v);
      // Cada canal en su propia media hora de la franja: la misma terminal y el
      // mismo instante harían que la consulta del evento viera el del otro canal.
      const h = canal === 'app' ? 0 : 1.5;

      reloj = a(15 + h);
      const t1 = await presentarRostro(plantilla);
      anotar('T1', canal, t1 === true ? 'PERMITIDO' : `negado (${String(t1)})`);
      expect(t1).toBe(true);
      expect(motivoDe(await ultimoEvento(terminalId))).toBe('PERMITIDO');

      // Un rostro que la terminal no tiene de Next Control: un id que no es de
      // ninguna plantilla (y, en la primera vuelta, uno que ni es UUID: una
      // persona dada de alta a mano en el equipo, H-15I-08).
      reloj = new Date(a(15 + h).getTime() + 5 * 60_000);
      const t2 = await presentarRostro(
        canal === 'app' ? '0042' : '70000000-0000-4000-8000-00000000ffff',
      );
      const e2 = await ultimoEvento(terminalId);
      anotar('T2', canal, t2 === true ? 'PERMITIDO' : motivoDe(e2));
      expect(t2).toBe(false);

      reloj = a(10 + h);
      const t3 = await presentarRostro(plantilla);
      const e3 = await ultimoEvento(terminalId);
      anotar('T3', canal, t3 === true ? 'PERMITIDO' : motivoDe(e3));
      expect(t3).toBe(false);
      expect(motivoDe(e3)).toBe('VIGENCIA_EXPIRADA');

      reloj = a(15 + h, 1);
      const t4 = await presentarRostro(plantilla);
      const e4 = await ultimoEvento(terminalId);
      anotar('T4', canal, t4 === true ? 'PERMITIDO' : motivoDe(e4));
      expect(t4).toBe(false);
      // Al día siguiente la plantilla ya venció con la visita (RN-11): en sitio
      // la terminal ni siquiera la tendría; aquí el motor lo dice por su orden
      // de precedencia (consentimiento antes que vigencia).
      expect(motivoDe(e4)).toBe('SIN_CONSENTIMIENTO');

      await vetar({ documento: v.documento });
      reloj = new Date(a(15 + h).getTime() + 10 * 60_000);
      const t5 = await presentarRostro(plantilla);
      const e5 = await ultimoEvento(terminalId);
      anotar('T5', canal, t5 === true ? 'PERMITIDO' : motivoDe(e5));
      expect(t5).toBe(false);
      expect(motivoDe(e5)).toBe('LISTA_NEGRA');
    });
  }
});

describe('ENSAYO SIMULADO · videoportero: timbre → aviso → vista en vivo → apertura atribuida', () => {
  it('V1 · el timbre llega a las consolas como aviso emergente, sin evento de acceso', async () => {
    if (omitida()) return;
    const canal = (app as INestApplication).get(CanalEnProceso, { strict: false });
    const avisos: { tema: string; carga: unknown }[] = [];
    const baja = canal.suscribir(COP_A, {
      entregar: (tema, carga) => {
        avisos.push({ tema, carga });
        return true;
      },
    });
    reloj = a(15);
    const r = await http()
      .post(`/alarm-server/${S_INTERCOM}`)
      .set('content-type', 'application/json')
      .send(
        JSON.stringify({
          eventType: 'videoIntercomEvent',
          dateTime: reloj.toISOString(),
          alarmDataType: 0,
          CallInfo: { buildingNumber: 'B', unitNumber: '42' },
        }),
      )
      .expect(200);
    baja();
    expect(r.body.motivo).toMatch(/avisada a las consolas/);
    const aviso = avisos.find((x) => x.tema === 'llamadas');
    anotar('V1', 'consola', aviso === undefined ? 'SIN AVISO' : 'aviso emergente recibido');
    expect(aviso?.carga).toMatchObject({ dispositivoId: INTERCOM, clase: 'llamada' });
  });

  it('V3 · la vista en vivo se pide a la API (WHEP); en simulado sin go2rtc lo dice', async () => {
    if (omitida()) return;
    const r = await http()
      .post(`/copropiedades/${COP_A}/guardia/video/${INTERCOM}/whep`)
      .set('Authorization', `Bearer ${operador}`)
      .set('content-type', 'application/sdp')
      .send('v=0\r\n');
    anotar('V3', 'consola', `${String(r.status)} · ${JSON.stringify(r.body).slice(0, 90)}`);
    // Sin GO2RTC_URL la API responde 503 y NOMBRA la variable: el navegador
    // nunca ve RTSP ni el puente (ADR-022). El vídeo real es de sitio.
    expect(r.status).toBe(503);
    expect(JSON.stringify(r.body)).toContain('GO2RTC_URL');
  });

  it('V4 · apertura remota atribuida al operador, persistida y ejecutada por el proveedor', async () => {
    if (omitida()) return;
    const antes = mock.aperturas.length;
    ordenAHoraReal();
    const r = await con(operador).post(`/copropiedades/${COP_A}/guardia/ordenes`, {
      dispositivoId: INTERCOM,
      accion: 'abrir',
      motivo: `Ensayo ${CORRIDA}: visitante confirmado por el residente`,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.operadorId).toBe(OPERADOR);
    const apertura = mock.aperturas.slice(antes).find((x) => x.dispositivoId === INTERCOM);
    expect(apertura?.actorId).toBe(OPERADOR);
    const guardadas = await con(operador).get(`/copropiedades/${COP_A}/guardia/ordenes`);
    const suya = (guardadas.body.ordenes as { motivo: string; operadorId: string }[]).find((o) =>
      o.motivo.includes(CORRIDA),
    );
    anotar(
      'V4',
      'consola',
      suya === undefined ? 'orden sin persistir' : `abierta por ${suya.operadorId}`,
    );
    expect(suya?.operadorId).toBe(OPERADOR);
  });

  it('V5 · negación con motivo: la puerta NO se mueve y queda registrada', async () => {
    if (omitida()) return;
    const antes = mock.aperturas.length;
    ordenAHoraReal();
    const r = await con(operador).post(`/copropiedades/${COP_A}/guardia/ordenes`, {
      dispositivoId: INTERCOM,
      accion: 'negar',
      motivo: `Ensayo ${CORRIDA}: el residente no reconoce al visitante`,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(mock.aperturas.length).toBe(antes);
    anotar('V5', 'consola', 'negada con motivo, sin apertura');
  });
});
