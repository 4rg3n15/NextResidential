import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import {
  ADMINISTRADOR_DE_CUENTAS,
  MENSAJE_CREDENCIALES,
  PROVEEDOR_DE_IDENTIDAD,
} from '../src/cuentas';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import { ProveedorDeIdentidadFalso } from './dobles/proveedor-de-identidad';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ETAPA 15-I · RESIDENTES Y VEHÍCULOS PROPIOS, CONTRA LA BASE REAL
 *
 * La cadena entera por HTTP, con los adaptadores PostgreSQL del residente, el
 * GANCHO de claims de la base y la RLS forzada: sólo el proveedor de identidad
 * es falso (la suite no alcanza Supabase Auth).
 *
 *   código corto → alta del residente → cambio obligatorio → primer ingreso →
 *   ocupantes (una vez, definitivo) → códigos de un solo uso con límite de
 *   intentos → vehículos propios dentro del tope, también bajo concurrencia →
 *   terceros sin límite → perfil y teléfono de portería → aislamiento por el
 *   camino de servicio.
 *
 * Se OMITE sin `DATABASE_URL_PRUEBAS`, y lo dice: una omisión no es un verde.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const SUPER = '00000000-0000-4000-8000-000000000001';
const INICIAL = 'Inicial#2026';
const NUEVA = 'Hogar#2026xy';
const SUFIJO = String(Date.now()).slice(-7);
const CODIGO = `M${SUFIJO.slice(-5)}`;

let pool: Pool | undefined;
let app: INestApplication | undefined;
let disponible = false;
let superadmin = '';

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    await pool.query('SELECT 1 FROM public.plazas_de_ocupante LIMIT 1');
    disponible = true;
  } catch {
    disponible = false;
    return;
  }
  const firmante = await crearFirmante();
  const proveedor = new ProveedorDeIdentidadFalso(firmante, async (authUserId) => {
    const { rows } = await (pool as Pool).query<{ c: Record<string, unknown> }>(
      `SELECT public.custom_access_token_hook(jsonb_build_object('user_id', $1::text, 'claims', '{}'::jsonb)) -> 'claims' AS c`,
      [authUserId],
    );
    return rows[0]?.c ?? null;
  });
  app = await crearApp(
    firmante,
    (b) =>
      b
        .overrideProvider(PROVEEDOR_DE_IDENTIDAD)
        .useValue(proveedor)
        .overrideProvider(ADMINISTRADOR_DE_CUENTAS)
        .useValue(proveedor),
    {
      PERSISTENCIA_DE_EVENTOS: 'postgres',
      PERSISTENCIA_DE_BIOMETRIA: 'postgres',
      DATABASE_URL: URL_BASE,
      DATABASE_POOLER_URL: URL_BASE,
    },
  );
  superadmin = await tokenDe(firmante, {
    rol: 'superadministrador',
    copropiedadId: null,
    usuarioId: SUPER,
  });
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

const omitida = (): boolean => {
  if (disponible) return false;
  console.log(
    'OMITIDA: sin DATABASE_URL_PRUEBAS o sin la migración 0038. Se ejecuta con --con-base.',
  );
  return true;
};

const http = () => request((app as INestApplication).getHttpServer());
const comoSuper = (metodo: 'get' | 'post' | 'patch', ruta: string) =>
  http()[metodo](ruta).set('Authorization', `Bearer ${superadmin}`);
const con = (token: string) => ({
  get: (ruta: string) => http().get(ruta).set('Authorization', `Bearer ${token}`),
  post: (ruta: string, cuerpo: object) =>
    http().post(ruta).set('Authorization', `Bearer ${token}`).send(cuerpo),
  put: (ruta: string, cuerpo: object) =>
    http().put(ruta).set('Authorization', `Bearer ${token}`).send(cuerpo),
});
const uno = async <T extends object>(sql: string, p: unknown[]): Promise<T | undefined> =>
  (await (pool as Pool).query<T>(sql, p)).rows[0];

const perfil = (n: number) => ({
  nombres: `Ocupante${String(n)}`,
  apellidos: `Prueba ${SUFIJO}`,
  fechaNacimiento: '1988-03-14',
  tipoDocumento: 'cedula',
  numeroDocumento: `9${SUFIJO}${String(n)}`,
  correo: `ocupante${String(n)}.${SUFIJO}@correo.invalid`,
  telefono: `+57300${SUFIJO}`.slice(0, 13),
});

/** Alta por el superadministrador, primer acceso POR CÓDIGO y cambio obligatorio. */
const residenteNuevo = async (n: number): Promise<string> => {
  const usuario = `res${String(n)}.${SUFIJO}`;
  const alta = await comoSuper('post', `/copropiedades/${COP_A}/residentes/cuentas`).send({
    usuario,
    contrasenaInicial: INICIAL,
    nombre: `Residente ${String(n)}`,
  });
  expect(alta.status, JSON.stringify(alta.body)).toBe(201);
  // Un origen declarado por residente: el límite por origen (10/min) es de la
  // consola, que pone a todos detrás de una IP; aquí cada uno es un teléfono.
  const origen = `198.51.100.${String(n)}`;
  const primero = await http()
    .post('/auth/acceso')
    .set('x-ncr-origen', origen)
    // La forma EXACTA del cliente Dart generado: los opcionales viajan como
    // `null`. Con `!== undefined` en el servidor, esto era un acceso por
    // «correo: null» y respondía 401 (hallazgo H-15I-04).
    .send({ correo: null, codigo: CODIGO.toLowerCase(), nit: null, usuario, contrasena: INICIAL });
  expect(primero.status, JSON.stringify(primero.body)).toBe(200);
  expect(primero.body.debeCambiarContrasena).toBe(true);
  // Con el cambio pendiente, ni siquiera el alta: 403 (ADR-023).
  expect((await con(primero.body.accessToken).get(`/copropiedades/${COP_A}/mi/alta`)).status).toBe(
    403,
  );
  const cambio = await con(primero.body.accessToken).post('/auth/contrasena', {
    actual: INICIAL,
    nueva: NUEVA,
  });
  expect(cambio.status, JSON.stringify(cambio.body)).toBe(200);
  const segundo = await http()
    .post('/auth/acceso')
    .send({ codigo: CODIGO, usuario, contrasena: NUEVA });
  expect(segundo.body.debeCambiarContrasena).toBe(false);
  return segundo.body.accessToken as string;
};

describe('15-I · residentes y vehículos propios contra la base real', () => {
  let viviendaId = '';
  const identificador = `P${SUFIJO}`;
  let primero = '';
  let codigos: string[] = [];
  let ocupanteIds: string[] = [];

  it('D1 · el superadministrador asigna el código corto; normalizado y único en la plataforma', async () => {
    if (omitida()) return;
    const { rows } = await (pool as Pool).query<{ id: string }>(
      `INSERT INTO public.viviendas (copropiedad_id, identificador, agrupacion, creado_por, actualizado_por)
       VALUES ($1, $2, 'Z', $3, $3) RETURNING id`,
      [COP_A, identificador, SUPER],
    );
    viviendaId = rows[0]?.id ?? '';
    const r = await comoSuper('patch', `/copropiedades/${COP_A}/configuracion`).send({
      codigoCorto: ` ${CODIGO.toLowerCase()} `,
      telefonoPorteria: '+57 601 555 0100',
      topeVehiculosPropios: 2,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.codigoCorto).toBe(CODIGO);
    expect(r.body.telefonoPorteria).toBe('+576015550100');
    const repetido = await comoSuper('patch', `/copropiedades/${COP_B}/configuracion`).send({
      codigoCorto: CODIGO,
    });
    expect(repetido.status).toBe(422);
    expect(JSON.stringify(repetido.body)).toContain('codigoCorto');
    const auditado = await uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.auditoria_seguridad
        WHERE tipo = 'cambio_configuracion' AND copropiedad_id_objetivo = $1
          AND identificador_solicitado LIKE '%codigoCorto%'`,
      [COP_A],
    );
    expect(Number(auditado?.n)).toBeGreaterThan(0);
  });

  it('D1 · código inexistente y usuario de otra copropiedad: la MISMA respuesta', async () => {
    if (omitida()) return;
    const usuario = `ajeno.${SUFIJO}`;
    const enRoble = await comoSuper('post', `/copropiedades/${COP_B}/residentes/cuentas`).send({
      usuario,
      contrasenaInicial: INICIAL,
      nombre: 'Residente de El Roble',
    });
    expect(enRoble.status).toBe(201);
    const inexistente = await http()
      .post('/auth/acceso')
      .send({ codigo: 'NOEXISTE', usuario, contrasena: INICIAL });
    const deOtra = await http()
      .post('/auth/acceso')
      .send({ codigo: CODIGO, usuario, contrasena: INICIAL });
    const bienEnSuCasa = await http()
      .post('/auth/acceso')
      .send({ codigo: 'ROBLE', usuario, contrasena: INICIAL });
    expect(inexistente.status).toBe(401);
    expect(deOtra.status).toBe(401);
    const sinCorrelacion = (b: { correlacion?: string }) => ({ ...b, correlacion: undefined });
    expect(JSON.stringify(inexistente.body)).toContain(MENSAJE_CREDENCIALES);
    expect(sinCorrelacion(deOtra.body)).toEqual(sinCorrelacion(inexistente.body));
    expect(bienEnSuCasa.status).toBe(200);
    // La consola sigue aceptando el NIT como alternativa (D1).
    const porNit = await http()
      .post('/auth/acceso')
      .send({ nit: '900987654', usuario, contrasena: INICIAL });
    expect(porNit.status).toBe(200);
  });

  it('3.2 · primer ingreso: la vivienda sin cuenta se vincula con «no lo tengo»', async () => {
    if (omitida()) return;
    primero = await residenteNuevo(1);
    const antes = await con(primero).get(`/copropiedades/${COP_A}/mi/alta`);
    expect(antes.body).toMatchObject({ completa: false, viviendaVinculada: false });
    expect(antes.body.vocabulario.etiquetaVivienda).toBe('Casa');
    expect(antes.body.avisoOcupantes).toContain('DEFINITIVO');
    const inexistente = await con(primero).post(`/copropiedades/${COP_A}/mi/alta`, {
      perfil: perfil(1),
      identificador: 'NO-EXISTE',
      codigo: null,
    });
    expect(inexistente.body.motivo).toBe('VIVIENDA_INEXISTENTE');
    const r = await con(primero).post(`/copropiedades/${COP_A}/mi/alta`, {
      perfil: perfil(1),
      identificador,
      agrupacion: 'z',
      codigo: null,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ vinculada: true, debeDeclararOcupantes: true });
    const estado = await con(primero).get(`/copropiedades/${COP_A}/mi/alta`);
    expect(estado.body).toMatchObject({ completa: false, debeDeclararOcupantes: true });
  });

  it('D6 · declara 3 ocupantes UNA vez; volver a declararlo es 403', async () => {
    if (omitida()) return;
    const sinConfirmar = await con(primero).post(`/copropiedades/${COP_A}/mi/ocupantes`, {
      numero: 3,
      confirmoQueEsDefinitivo: false,
    });
    expect(sinConfirmar.status).toBe(400);
    const r = await con(primero).post(`/copropiedades/${COP_A}/mi/ocupantes`, {
      numero: 3,
      confirmoQueEsDefinitivo: true,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.declarados).toBe(3);
    codigos = r.body.plazas
      .filter((p: { libre: boolean }) => p.libre)
      .map((p: { codigo: string }) => p.codigo);
    expect(codigos).toHaveLength(2);
    const otraVez = await con(primero).post(`/copropiedades/${COP_A}/mi/ocupantes`, {
      numero: 5,
      confirmoQueEsDefinitivo: true,
    });
    expect(otraVez.status).toBe(403);
    const guardados = await uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.bitacora_de_residentes
        WHERE vivienda_id = $1 AND detalle LIKE ANY (ARRAY[$2, $3])`,
      [viviendaId, `%${codigos[0] ?? '-'}%`, `%${(codigos[0] ?? '-').replace('-', '')}%`],
    );
    expect(guardados?.n, 'un código de ocupante apareció en la bitácora').toBe('0');
    const estado = await con(primero).get(`/copropiedades/${COP_A}/mi/alta`);
    expect(estado.body.completa).toBe(true);
  });

  it('3.2 · con cuenta dentro, el código es obligatorio; los equivocados se cuentan y bloquean', async () => {
    if (omitida()) return;
    const segundo = await residenteNuevo(2);
    const ruta = `/copropiedades/${COP_A}/mi/alta`;
    const sinCodigo = await con(segundo).post(ruta, {
      perfil: perfil(2),
      identificador,
      agrupacion: 'Z',
    });
    expect(sinCodigo.body.motivo).toBe('CODIGO_REQUERIDO');
    for (let i = 0; i < 5; i += 1) {
      const malo = await con(segundo).post(ruta, {
        perfil: perfil(2),
        identificador,
        agrupacion: 'Z',
        codigo: 'AAAA-AAAA',
      });
      expect(malo.body.motivo).toBe('CODIGO_INCORRECTO');
    }
    const bloqueado = await con(segundo).post(ruta, {
      perfil: perfil(2),
      identificador,
      agrupacion: 'Z',
      codigo: codigos[0],
    });
    expect(bloqueado.body.motivo).toBe('DEMASIADOS_INTENTOS');

    const tercero = await residenteNuevo(3);
    const bueno = await con(tercero).post(ruta, {
      perfil: perfil(3),
      identificador,
      agrupacion: 'Z',
      codigo: String(codigos[0]).toLowerCase(),
    });
    expect(bueno.body, JSON.stringify(bueno.body)).toMatchObject({
      vinculada: true,
      debeDeclararOcupantes: false,
    });
    const cuarto = await residenteNuevo(4);
    const reusado = await con(cuarto).post(ruta, {
      perfil: perfil(4),
      identificador,
      agrupacion: 'Z',
      codigo: codigos[0],
    });
    expect(reusado.body.motivo, 'un código de ocupante sirvió dos veces').toBe('CODIGO_INCORRECTO');
    const ajena = await con(cuarto).post(ruta, {
      perfil: perfil(1),
      identificador,
      agrupacion: 'Z',
      codigo: codigos[1],
    });
    expect(ajena.body.motivo, 'se apropió del documento de otro ocupante').toBe('DOCUMENTO_EN_USO');
    const f = await uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.bitacora_de_residentes
        WHERE vivienda_id = $1 AND tipo IN ('codigo_incorrecto', 'vinculacion_bloqueada', 'vinculacion')`,
      [viviendaId],
    );
    expect(Number(f?.n)).toBeGreaterThanOrEqual(8);
    const fam = await con(primero).get(`/copropiedades/${COP_A}/mi/familia`);
    ocupanteIds = fam.body.map((m: { residenteId: string }) => m.residenteId);
    expect(ocupanteIds).toHaveLength(2);
  });

  it('D5 a · dos propios al instante; el TERCERO se rechaza con su motivo y queda en la bitácora', async () => {
    if (omitida()) return;
    const ruta = `/copropiedades/${COP_A}/mi/vehiculos`;
    const auto = (placa: string, ocupantes = ocupanteIds) => ({
      placa,
      color: 'Gris',
      modelo: 'Mazda 3',
      tipo: 'automovil',
      ocupantes,
    });
    const a = await con(primero).post(ruta, auto(`A${SUFIJO.slice(-5)}`, ocupanteIds));
    const b = await con(primero).post(ruta, auto(`B${SUFIJO.slice(-5)}`, [ocupanteIds[0] ?? '']));
    expect(a.body.registrado, JSON.stringify(a.body)).toBe(true);
    expect(b.body.registrado, JSON.stringify(b.body)).toBe(true);
    const c = await con(primero).post(ruta, auto(`C${SUFIJO.slice(-5)}`));
    expect(c.status).toBe(200);
    expect(c.body.motivo).toBe('TOPE_ALCANZADO');
    expect(c.body.explicacion).toContain('superadministrador');
    const rastro = await uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.bitacora_de_residentes
        WHERE vivienda_id = $1 AND tipo IN ('vehiculo_propio_registrado', 'vehiculo_propio_rechazado_por_tope')`,
      [viviendaId],
    );
    expect(rastro?.n).toBe('3');
    // Activo al instante: el motor lo verá como vehículo del padrón.
    const fila = await uno<{ estado: string; origen: string; ocupantes: string }>(
      `SELECT v.estado::text AS estado, v.origen_registro AS origen,
              (SELECT count(*)::text FROM public.vehiculos_ocupantes o WHERE o.vehiculo_id = v.id) AS ocupantes
         FROM public.vehiculos v WHERE v.id = $1`,
      [a.body.id],
    );
    expect(fila).toEqual({ estado: 'activo', origen: 'residente', ocupantes: '2' });
  });

  it('D5 a · el superadministrador registra POR ENCIMA del tope, lo ve todo y el tope configurado se respeta', async () => {
    if (omitida()) return;
    const porEncima = await comoSuper('post', `/copropiedades/${COP_A}/padron/vehiculos`).send({
      viviendaId,
      placa: `S${SUFIJO.slice(-5)}`,
      tipo: 'automovil',
    });
    expect(porEncima.status, JSON.stringify(porEncima.body)).toBe(201);
    const vista = await comoSuper('get', `/copropiedades/${COP_A}/residentes/vehiculos`);
    const deEsta = vista.body.filter((v: { viviendaId: string }) => v.viviendaId === viviendaId);
    expect(deEsta).toHaveLength(2);
    expect(deEsta[0].registradoEn).toBeTruthy();
    expect(deEsta[0].vivienda).toContain(identificador);

    await comoSuper('patch', `/copropiedades/${COP_A}/configuracion`).send({
      topeVehiculosPropios: 3,
    });
    const d = await con(primero).post(`/copropiedades/${COP_A}/mi/vehiculos`, {
      placa: `D${SUFIJO.slice(-5)}`,
      color: 'Rojo',
      modelo: 'Kia Rio',
      tipo: 'automovil',
      ocupantes: [ocupanteIds[1]],
    });
    expect(d.body.registrado, JSON.stringify(d.body)).toBe(true);
    const e = await con(primero).post(`/copropiedades/${COP_A}/mi/vehiculos`, {
      placa: `E${SUFIJO.slice(-5)}`,
      color: 'Rojo',
      modelo: 'Kia Rio',
      tipo: 'automovil',
      ocupantes: [ocupanteIds[1]],
    });
    expect(e.body.motivo).toBe('TOPE_ALCANZADO');
    await comoSuper('patch', `/copropiedades/${COP_A}/configuracion`).send({
      topeVehiculosPropios: 2,
    });

    // Desactivar libera el cupo. El tope volvió a 2 con 3 activos: una nueva
    // alta se rechaza; tras bajar dos, cabe.
    const nueva = {
      placa: `F${SUFIJO.slice(-5)}`,
      color: 'Negro',
      modelo: 'Renault Logan',
      tipo: 'automovil',
      ocupantes: [ocupanteIds[0]],
    };
    const llena = await con(primero).post(`/copropiedades/${COP_A}/mi/vehiculos`, nueva);
    expect(llena.body.motivo).toBe('TOPE_ALCANZADO');
    const propios = await (pool as Pool).query<{ id: string }>(
      `SELECT id FROM public.vehiculos WHERE vivienda_id = $1 AND origen_registro = 'residente'
          AND estado = 'activo' ORDER BY creado_en`,
      [viviendaId],
    );
    for (const v of propios.rows.slice(0, 2)) {
      const baja = await con(primero).post(
        `/copropiedades/${COP_A}/mi/vehiculos/${v.id}/desactivacion`,
        {},
      );
      expect(baja.status).toBe(200);
    }
    const cabe = await con(primero).post(`/copropiedades/${COP_A}/mi/vehiculos`, nueva);
    expect(cabe.body.registrado, JSON.stringify(cabe.body)).toBe(true);
  });

  it('ADR-04 · altas CONCURRENTES no rebasan el tope: la base decide', async () => {
    if (omitida()) return;
    const { rows } = await (pool as Pool).query<{ id: string }>(
      `SELECT id FROM public.vehiculos WHERE vivienda_id = $1 AND origen_registro = 'residente'
          AND estado = 'activo'`,
      [viviendaId],
    );
    for (const v of rows) {
      await con(primero).post(`/copropiedades/${COP_A}/mi/vehiculos/${v.id}/desactivacion`, {});
    }
    const intentos = await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        con(primero).post(`/copropiedades/${COP_A}/mi/vehiculos`, {
          placa: `K${String(i)}${SUFIJO.slice(-4)}`,
          color: 'Blanco',
          modelo: 'Chevrolet Spark',
          tipo: 'automovil',
          ocupantes: [ocupanteIds[0]],
        }),
      ),
    );
    const registrados = intentos.filter((r) => r.body.registrado === true).length;
    const rechazados = intentos.filter((r) => r.body.motivo === 'TOPE_ALCANZADO').length;
    expect(registrados, JSON.stringify(intentos.map((r) => r.body))).toBe(2);
    expect(rechazados).toBe(3);
    const activos = await uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.vehiculos WHERE vivienda_id = $1
          AND origen_registro = 'residente' AND estado = 'activo'`,
      [viviendaId],
    );
    expect(activos?.n).toBe('2');
  });

  it('D5 b · con sus dos propios, la vivienda crea autorizaciones de TERCEROS sin límite', async () => {
    if (omitida()) return;
    const desde = new Date(Date.now() + 3_600_000);
    const hasta = new Date(desde.getTime() + 2 * 3_600_000);
    for (let i = 0; i < 3; i += 1) {
      const r = await con(primero).post(`/copropiedades/${COP_A}/mi/autorizaciones`, {
        visitante: `Tercero ${String(i)} ${SUFIJO}`,
        desde: desde.toISOString(),
        hasta: hasta.toISOString(),
        placa: `T${String(i)}${SUFIJO.slice(-4)}`,
        permiteAccesoVehicular: true,
        claveDeIdempotencia: `terceros-${SUFIJO}-${String(i)}`,
      });
      expect(r.body.creada, JSON.stringify(r.body)).toBe(true);
    }
  });

  it('3.5 · el perfil: editable, con la copropiedad y el teléfono de portería; el documento no va a la bitácora', async () => {
    if (omitida()) return;
    const antes = await con(primero).get(`/copropiedades/${COP_A}/mi/perfil`);
    expect(antes.body).toMatchObject({
      telefonoPorteria: '+576015550100',
      copropiedadNombre: expect.any(String),
    });
    const r = await con(primero).put(`/copropiedades/${COP_A}/mi/perfil`, {
      ...perfil(1),
      nombres: 'Ana María',
      numeroDocumento: `8${SUFIJO}1`,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.perfil.nombreCompleto).toBe(`Ana María Prueba ${SUFIJO}`);
    const usado = await con(primero).put(`/copropiedades/${COP_A}/mi/perfil`, perfil(3));
    expect(usado.body.motivo).toBe('DOCUMENTO_EN_USO');
    const filtrado = await uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.bitacora_de_residentes WHERE detalle LIKE $1`,
      [`%${SUFIJO}1%`],
    );
    expect(filtrado?.n).toBe('0');
  });

  it('KPI-36/37 · camino de servicio: la copropiedad ajena no ve ni toca las plazas de ésta', async () => {
    if (omitida()) return;
    const desdeRoble = await comoSuper(
      'get',
      `/copropiedades/${COP_B}/viviendas/${viviendaId}/ocupantes`,
    );
    expect(desdeRoble.status).toBe(200);
    expect(desdeRoble.body).toEqual([]);
    const anadirDesdeRoble = await comoSuper(
      'post',
      `/copropiedades/${COP_B}/viviendas/${viviendaId}/ocupantes`,
    ).send({ cantidad: 1, motivo: 'intento cruzado' });
    expect(anadirDesdeRoble.status).toBe(404);
    const vehiculosRoble = await comoSuper('get', `/copropiedades/${COP_B}/residentes/vehiculos`);
    expect(
      vehiculosRoble.body.some((v: { viviendaId: string }) => v.viviendaId === viviendaId),
    ).toBe(false);
    const cuentasRoble = await comoSuper('get', `/copropiedades/${COP_B}/residentes/cuentas`);
    expect(JSON.stringify(cuentasRoble.body)).not.toContain(`res1.${SUFIJO}`);
  });

  it('D6 · el superadministrador añade y quita ocupantes con rastro; quitar una plaza ocupada da de baja el vínculo', async () => {
    if (omitida()) return;
    const ruta = `/copropiedades/${COP_A}/viviendas/${viviendaId}/ocupantes`;
    const anadidas = await comoSuper('post', ruta).send({ cantidad: 1, motivo: 'nace un bebé' });
    expect(anadidas.status, JSON.stringify(anadidas.body)).toBe(200);
    expect(anadidas.body).toHaveLength(4);
    const ocupada = anadidas.body.find((p: { numero: number }) => p.numero === 2);
    const retiro = await comoSuper('post', `${ruta}/${String(ocupada.id)}/retiro`).send({
      motivo: 'se mudó a otra ciudad',
    });
    expect(retiro.status).toBe(200);
    const fam = await con(primero).get(`/copropiedades/${COP_A}/mi/familia`);
    expect(fam.body.filter((m: { activo: boolean }) => m.activo)).toHaveLength(1);
    const rastro = await uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.bitacora_de_residentes
        WHERE vivienda_id = $1 AND tipo IN ('plaza_anadida', 'plaza_retirada') AND actor_id = $2`,
      [viviendaId, SUPER],
    );
    expect(rastro?.n).toBe('2');
  });
});
