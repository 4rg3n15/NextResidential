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
import { VERSION_DE_LA_POLITICA_DE_DATOS } from '../src/cuentas/aplicacion/politica-de-datos';
import { ProveedorDeIdentidadFalso } from './dobles/proveedor-de-identidad';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ETAPA 15-I · RESIDENTES Y VEHÍCULOS PROPIOS, CONTRA LA BASE REAL · 15-W
 *
 * La cadena entera por HTTP, con los adaptadores PostgreSQL del residente, el
 * GANCHO de claims de la base y la RLS forzada: sólo el proveedor de identidad
 * es falso (la suite no alcanza Supabase Auth).
 *
 *   código corto → el TITULAR nace con su vivienda (D1) → cambio obligatorio →
 *   primer ingreso sin vivienda ni código (D3) → ocupantes de 1 al tope → los
 *   demás crean su cuenta con el código de su plaza (D2) → cambiar de vivienda
 *   exige código, con límite de intentos → vehículos propios dentro del tope,
 *   también bajo concurrencia, y su edición y borrado según el historial (D5) →
 *   terceros sin límite → perfil y teléfono de portería → aislamiento por el
 *   camino de servicio.
 *
 * Se OMITE sin `DATABASE_URL_PRUEBAS`, y lo dice: una omisión no es un verde.
 * ═════════════════════════════════════════════════════════════════════════════
 */
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

// H-15L-C01 · con `--con-base`, una prueba sin base FALLA aquí, con su nombre.
exigirBase('sin DATABASE_URL_PRUEBAS o sin la migración 0038', () => disponible);
const omitida = (): boolean => !disponible;

const http = () => request((app as INestApplication).getHttpServer());
const comoSuper = (metodo: 'get' | 'post' | 'patch', ruta: string) =>
  http()[metodo](ruta).set('Authorization', `Bearer ${superadmin}`);
const con = (token: string) => ({
  get: (ruta: string) => http().get(ruta).set('Authorization', `Bearer ${token}`),
  post: (ruta: string, cuerpo: object) =>
    http().post(ruta).set('Authorization', `Bearer ${token}`).send(cuerpo),
  put: (ruta: string, cuerpo: object) =>
    http().put(ruta).set('Authorization', `Bearer ${token}`).send(cuerpo),
  delete: (ruta: string) => http().delete(ruta).set('Authorization', `Bearer ${token}`),
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

/** El acceso por código corto, con la forma EXACTA del cliente Dart generado. */
const acceder = (usuario: string, contrasena: string, origen: string) =>
  http()
    .post('/auth/acceso')
    // Un origen declarado por residente: el límite por origen (10/min) es de la
    // consola, que pone a todos detrás de una IP; aquí cada uno es un teléfono.
    .set('x-ncr-origen', origen)
    // Los opcionales viajan como `null`. Con `!== undefined` en el servidor,
    // esto era un acceso por «correo: null» y respondía 401 (H-15I-04). Sin
    // `nit` desde la 15-L (ADR-031): el cliente regenerado ya no lo lleva.
    .send({ correo: null, codigo: CODIGO.toLowerCase(), usuario, contrasena });

/** El `usuario_id` de los claims del token: el de la cuenta que habla. */
const usuarioDe = (token: string): string =>
  (
    JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
      usuario_id: string;
    }
  ).usuario_id;

/** Una vivienda activa y vacía, montada por el superusuario: no es lo probado. */
const viviendaEn = async (copropiedadId: string, identificador: string): Promise<string> =>
  (
    await uno<{ id: string }>(
      `INSERT INTO public.viviendas (copropiedad_id, identificador, agrupacion, creado_por, actualizado_por)
       VALUES ($1, $2, 'Z', $3, $3) RETURNING id`,
      [copropiedadId, identificador, SUPER],
    )
  )?.id ?? '';

/** D1 (15-W) · el TITULAR: lo crea la administración con su vivienda; cambio obligatorio. */
const titularNuevo = async (n: number, viviendaId: string): Promise<string> => {
  const usuario = `res${String(n)}.${SUFIJO}`;
  const alta = await comoSuper('post', `/copropiedades/${COP_A}/residentes/cuentas`).send({
    usuario,
    contrasenaInicial: INICIAL,
    nombre: `Residente ${String(n)}`,
    viviendaId,
  });
  expect(alta.status, JSON.stringify(alta.body)).toBe(201);
  const origen = `198.51.100.${String(n)}`;
  const primero = await acceder(usuario, INICIAL, origen);
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
  const segundo = await acceder(usuario, NUEVA, origen);
  expect(segundo.body.debeCambiarContrasena).toBe(false);
  return segundo.body.accessToken as string;
};

/** D2 (15-W) · los demás: «Crear cuenta» con el código de su plaza, y el acceso de siempre. */
const ocupanteNuevo = async (n: number, codigo: string): Promise<string> => {
  const usuario = `res${String(n)}.${SUFIJO}`;
  const r = await http()
    .post('/auth/registro')
    .set('x-forwarded-for', `203.0.113.${String(n)}`)
    .send({
      usuario,
      correo: `res${String(n)}.${SUFIJO}@correo.invalid`,
      contrasena: NUEVA,
      confirmacion: NUEVA,
      codigoDeInvitacion: codigo,
      fechaNacimiento: '1990-05-17',
      aceptaTratamientoDeDatos: true,
      versionPolitica: VERSION_DE_LA_POLITICA_DE_DATOS,
    });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  // «Crear cuenta» no emite tokens: se entra después, por el acceso de siempre.
  expect(r.body).toEqual({ creada: true });
  const a = await acceder(usuario, NUEVA, `198.51.100.${String(n)}`);
  expect(a.status, JSON.stringify(a.body)).toBe(200);
  // Quien eligió su contraseña no la cambia al entrar.
  expect(a.body.debeCambiarContrasena).toBe(false);
  return a.body.accessToken as string;
};

describe('15-I · residentes y vehículos propios contra la base real', () => {
  let viviendaId = '';
  const identificador = `P${SUFIJO}`;
  let primero = '';
  let codigos: string[] = [];
  let ocupanteIds: string[] = [];
  let segundo = '';
  let tercero = '';
  // La vivienda Q, del vecino: de ella sale quien se muda a P, y su titular
  // es el «adulto de otra vivienda» que no alcanza los vehículos de P.
  let viviendaQ = '';
  let vecino = '';

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
      // 15-W (D1) · la cuenta de la administración nace con su vivienda.
      viviendaId: await viviendaEn(COP_B, `R${SUFIJO}`),
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
    // H3 (15-L, ADR-031) · el NIT ya no es una forma de entrar: ni se admite el campo.
    const porNit = await http()
      .post('/auth/acceso')
      .send({ nit: '900987654', usuario, contrasena: INICIAL });
    expect(porNit.status).toBe(400);
  });

  it('D1/D3 (15-W) · el titular nace con su vivienda; su primer ingreso no pide vivienda ni código', async () => {
    if (omitida()) return;
    primero = await titularNuevo(1, viviendaId);
    const antes = await con(primero).get(`/copropiedades/${COP_A}/mi/alta`);
    expect(antes.body).toMatchObject({
      completa: false,
      viviendaVinculada: false,
      viviendaAsignada: true,
      aviso: null,
    });
    expect(antes.body.vocabulario.etiquetaVivienda).toBe('Casa');
    // El aviso del 15-I («el número es DEFINITIVO») ya no es verdad (D-W10).
    expect(antes.body.avisoOcupantes).not.toContain('DEFINITIVO');
    const ruta = `/copropiedades/${COP_A}/mi/alta`;
    // §6 · ni vivienda, ni la forma del alta vieja, ni el rol: 400 por forma.
    for (const intruso of [
      { ...perfil(1), viviendaId },
      { ...perfil(1), esTitular: true },
      { perfil: perfil(1), identificador, codigo: null },
    ]) {
      const r = await con(primero).post(ruta, intruso);
      expect(r.status, JSON.stringify(r.body)).toBe(400);
    }
    // D3 · el documento es de ADULTO: la tarjeta de identidad es de los menores.
    const deMenor = await con(primero).post(ruta, {
      ...perfil(1),
      tipoDocumento: 'tarjeta_identidad',
    });
    expect(deMenor.status).toBe(400);
    const r = await con(primero).post(ruta, perfil(1));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ vinculada: true, debeDeclararOcupantes: true });
    // Titular de ESA vivienda, por la administración (D1): `es_titular` y la ocupación.
    const fila = await uno<{ titular: boolean; primero: string | null }>(
      `SELECT r.es_titular AS titular,
              (SELECT o.primer_residente_id::text FROM public.ocupacion_de_viviendas o
                WHERE o.vivienda_id = r.vivienda_id) AS primero
         FROM public.residentes r JOIN public.usuarios u ON u.persona_id = r.persona_id
        WHERE u.id = $1 AND r.vivienda_id = $2 AND r.estado = 'activo'`,
      [usuarioDe(primero), viviendaId],
    );
    expect(fila).toEqual({ titular: true, primero: usuarioDe(primero) });
    const estado = await con(primero).get(`/copropiedades/${COP_A}/mi/alta`);
    expect(estado.body).toMatchObject({ completa: false, debeDeclararOcupantes: true });
  });

  it('D6/D-W10 · el titular declara de 1 al tope; volver a declararlo es 403', async () => {
    if (omitida()) return;
    const ruta = `/copropiedades/${COP_A}/mi/ocupantes`;
    const deMas = await con(primero).post(ruta, { numero: 5 });
    expect(deMas.status, JSON.stringify(deMas.body)).toBe(409);
    expect(JSON.stringify(deMas.body)).toContain('máximo de 4 plazas');
    const r = await con(primero).post(ruta, { numero: 4 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ declarados: 4, tope: 4, esTitular: true });
    codigos = r.body.plazas
      .filter((p: { libre: boolean }) => p.libre)
      .map((p: { codigo: string }) => p.codigo);
    expect(codigos).toHaveLength(3);
    // D2 · con el prefijo del conjunto: el código dice solo de qué copropiedad es.
    expect(
      codigos.every((c) => c.startsWith(`${CODIGO}-`)),
      codigos.join(' '),
    ).toBe(true);
    const otraVez = await con(primero).post(ruta, { numero: 2 });
    expect(otraVez.status).toBe(403);
    const guardados = await uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.bitacora_de_residentes
        WHERE vivienda_id = $1 AND detalle LIKE ANY (ARRAY[$2, $3])`,
      [
        viviendaId,
        `%${(codigos[0] ?? '-').slice(-9)}%`,
        `%${(codigos[0] ?? '-').slice(-9).replace('-', '')}%`,
      ],
    );
    expect(guardados?.n, 'un código de ocupante apareció en la bitácora').toBe('0');
    const estado = await con(primero).get(`/copropiedades/${COP_A}/mi/alta`);
    expect(estado.body.completa).toBe(true);
  });

  it('D2 · los demás crean su cuenta con el código de SU plaza: nace allí, nunca de titular', async () => {
    if (omitida()) return;
    segundo = await ocupanteNuevo(2, String(codigos[0]));
    const estado = await con(segundo).get(`/copropiedades/${COP_A}/mi/alta`);
    expect(estado.body).toMatchObject({
      viviendaVinculada: false,
      viviendaAsignada: true,
      debeDeclararOcupantes: false,
    });
    const alta = await con(segundo).post(`/copropiedades/${COP_A}/mi/alta`, perfil(2));
    expect(alta.body, JSON.stringify(alta.body)).toMatchObject({
      vinculada: true,
      debeDeclararOcupantes: false,
    });
    const fila = await uno<{ origen: string; titular: boolean; plaza: number }>(
      `SELECT u.origen_de_alta AS origen, r.es_titular AS titular, p.numero AS plaza
         FROM public.usuarios u
         JOIN public.residentes r ON r.persona_id = u.persona_id AND r.estado = 'activo'
         JOIN public.plazas_de_ocupante p ON p.usuario_id = u.id AND p.estado = 'activo'
        WHERE u.id = $1 AND r.vivienda_id = $2`,
      [usuarioDe(segundo), viviendaId],
    );
    expect(fila).toEqual({ origen: 'autorregistro', titular: false, plaza: 2 });
    // Un código sirve una vez: el mismo, para otra cuenta, es el error genérico.
    const reusado = await http()
      .post('/auth/registro')
      .set('x-forwarded-for', '203.0.113.30')
      .send({
        usuario: `res30.${SUFIJO}`,
        correo: `res30.${SUFIJO}@correo.invalid`,
        contrasena: NUEVA,
        confirmacion: NUEVA,
        codigoDeInvitacion: codigos[0],
        fechaNacimiento: '1990-05-17',
        aceptaTratamientoDeDatos: true,
        versionPolitica: VERSION_DE_LA_POLITICA_DE_DATOS,
      });
    expect(reusado.status, 'un código de ocupante sirvió dos veces').toBe(400);
    expect(JSON.stringify(reusado.body)).toContain('no es válido o ya se usó');
    // Sin guiones y en minúsculas también vale: la normalización es del dominio.
    tercero = await ocupanteNuevo(3, String(codigos[1]).toLowerCase().replace(/-/g, ''));
    const ajena = await con(tercero).post(`/copropiedades/${COP_A}/mi/alta`, perfil(1));
    expect(ajena.body.motivo, 'se apropió del documento de otro ocupante').toBe('DOCUMENTO_EN_USO');
    const propia = await con(tercero).post(`/copropiedades/${COP_A}/mi/alta`, perfil(3));
    expect(propia.body.vinculada, JSON.stringify(propia.body)).toBe(true);
  });

  it('3.5 · cambiar de vivienda exige el código de la de destino; los equivocados se cuentan y bloquean', async () => {
    if (omitida()) return;
    viviendaQ = await viviendaEn(COP_A, `Q${SUFIJO}`);
    vecino = await titularNuevo(5, viviendaQ);
    expect((await con(vecino).post(`/copropiedades/${COP_A}/mi/alta`, perfil(5))).status).toBe(200);
    const plazasQ = await con(vecino).post(`/copropiedades/${COP_A}/mi/ocupantes`, { numero: 2 });
    const codigoQ = plazasQ.body.plazas.find((p: { libre: boolean }) => p.libre)?.codigo as string;
    const ruta = `/copropiedades/${COP_A}/mi/vinculacion`;
    const hacia = (codigo: string | null) => ({
      perfil: perfil(3),
      identificador: `Q${SUFIJO}`,
      agrupacion: 'z',
      codigo,
    });
    expect((await con(tercero).post(ruta, hacia(null))).body.motivo).toBe('CODIGO_REQUERIDO');
    // Un prefijo de OTRO conjunto es un código incorrecto, aunque la parte de la plaza sea buena.
    const otroConjunto = await con(tercero).post(ruta, hacia(`ROBLE-${codigoQ.slice(-9)}`));
    expect(otroConjunto.body.motivo).toBe('CODIGO_INCORRECTO');
    for (let i = 0; i < 4; i += 1) {
      const malo = await con(tercero).post(ruta, hacia('AAAA-AAAA'));
      expect(malo.body.motivo).toBe('CODIGO_INCORRECTO');
    }
    const bloqueado = await con(tercero).post(ruta, hacia(codigoQ));
    expect(bloqueado.body.motivo).toBe('DEMASIADOS_INTENTOS');
    const f = await uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.bitacora_de_residentes
        WHERE usuario_id = $1 AND tipo IN ('codigo_incorrecto', 'vinculacion_bloqueada')`,
      [usuarioDe(tercero)],
    );
    expect(Number(f?.n)).toBeGreaterThanOrEqual(6);
    // Con el código bueno de la plaza 4 de P, alguien de Q se muda a P (y deja Q).
    const deQ = await ocupanteNuevo(6, codigoQ);
    expect((await con(deQ).post(`/copropiedades/${COP_A}/mi/alta`, perfil(6))).status).toBe(200);
    const mudanza = await con(deQ).post(ruta, {
      perfil: perfil(6),
      identificador,
      agrupacion: 'Z',
      codigo: codigos[2],
    });
    expect(mudanza.body, JSON.stringify(mudanza.body)).toMatchObject({ vinculada: true });
    // La plaza que dejó en Q quedó libre con OTRO código: el anterior ya no abre nada.
    const enQ = await con(vecino).get(`/copropiedades/${COP_A}/mi/ocupantes`);
    const libresQ = enQ.body.plazas.filter((p: { libre: boolean }) => p.libre);
    expect(libresQ).toHaveLength(1);
    expect(libresQ[0].codigo).not.toBe(codigoQ);
    // P-38 · el titular no se muda desde la app: ni se mira el código.
    const titularDeQ = await con(vecino).post(ruta, {
      perfil: perfil(5),
      identificador,
      agrupacion: 'Z',
      codigo: libresQ[0].codigo,
    });
    expect(titularDeQ.body.motivo).toBe('TITULAR_NO_SE_MUDA');
    const fam = await con(primero).get(`/copropiedades/${COP_A}/mi/familia`);
    ocupanteIds = fam.body.map((m: { residenteId: string }) => m.residenteId);
    expect(ocupanteIds).toHaveLength(4);
  });

  it('D5 a · dos propios al instante; el TERCERO se rechaza con su motivo y queda en la bitácora', async () => {
    if (omitida()) return;
    const ruta = `/copropiedades/${COP_A}/mi/vehiculos`;
    const auto = (placa: string, ocupantes = ocupanteIds.slice(0, 2)) => ({
      placa,
      color: 'Gris',
      modelo: 'Mazda 3',
      tipo: 'automovil',
      ocupantes,
    });
    const a = await con(primero).post(ruta, auto(`A${SUFIJO.slice(-5)}`));
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

    // 3i (corrección de la 15-L) · lo que el residente cambió en la APP es lo
    // que la CONSOLA lista en su siguiente recarga: la misma API, la misma base.
    const consola = await comoSuper('get', `/copropiedades/${COP_A}/residentes/vehiculos`);
    const porPlaca = new Map(
      (consola.body as { placa: string; activo: boolean }[]).map((v) => [v.placa, v.activo]),
    );
    expect(porPlaca.get(nueva.placa)).toBe(true);
    for (const v of propios.rows.slice(0, 2)) {
      const dado = (consola.body as { id: string; activo: boolean }[]).find((x) => x.id === v.id);
      expect(dado?.activo ?? false, 'dado de baja en la app, inactivo en la consola').toBe(false);
    }
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

  it('G (15-L) · el superadministrador edita el perfil del residente: mismas reglas, y el rastro dice quién y qué campos', async () => {
    if (omitida()) return;
    const usuarioId = (
      JSON.parse(Buffer.from(primero.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
        usuario_id: string;
      }
    ).usuario_id;
    const ruta = `/copropiedades/${COP_A}/residentes/cuentas/${usuarioId}/perfil`;
    const visto = await comoSuper('get', ruta);
    expect(visto.status, JSON.stringify(visto.body)).toBe(200);
    const cambio = await http()
      .put(ruta)
      .set('Authorization', `Bearer ${superadmin}`)
      .send({
        ...perfil(1),
        nombres: 'Ana Lucía',
        numeroDocumento: `8${SUFIJO}1`,
        telefono: '+573009990011',
      });
    expect(cambio.status, JSON.stringify(cambio.body)).toBe(200);
    expect(cambio.body.perfil).toMatchObject({
      nombreCompleto: `Ana Lucía Prueba ${SUFIJO}`,
      telefono: '+573009990011',
    });
    // El residente ve lo que cambió el superadministrador.
    expect((await con(primero).get(`/copropiedades/${COP_A}/mi/perfil`)).body.nombres).toBe(
      'Ana Lucía',
    );
    const hecho = await uno<{ actor: string; detalle: string }>(
      `SELECT actor_id::text AS actor, detalle FROM public.bitacora_de_residentes
        WHERE usuario_id = $1 AND tipo = 'perfil_editado' ORDER BY ocurrido_en DESC LIMIT 1`,
      [usuarioId],
    );
    expect(hecho?.actor).toBe(SUPER);
    expect(hecho?.detalle).toMatch(/^editado por el superadministrador: .*nombres/);
    expect(hecho?.detalle).toMatch(/telefono/);
    expect(hecho?.detalle).not.toContain(SUFIJO);
    // Las mismas reglas: un documento de otra persona, no; una fecha imposible, 400.
    const usado = await http()
      .put(ruta)
      .set('Authorization', `Bearer ${superadmin}`)
      .send(perfil(3));
    expect(usado.body.motivo).toBe('DOCUMENTO_EN_USO');
    const mala = await http()
      .put(ruta)
      .set('Authorization', `Bearer ${superadmin}`)
      .send({ ...perfil(1), numeroDocumento: `8${SUFIJO}1`, fechaNacimiento: '2999-01-01' });
    expect(mala.status).toBe(400);
    // Desde otra copropiedad, el mismo residente no existe.
    expect(
      (await comoSuper('get', `/copropiedades/${COP_B}/residentes/cuentas/${usuarioId}/perfil`))
        .status,
    ).toBe(404);
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
    // Ya estaba en el tope (4): la ruta del superadministrador lo sube a 5 (D4 bis).
    expect(anadidas.body).toHaveLength(5);
    expect(
      (
        await uno<{ tope: number }>(
          'SELECT tope_de_plazas AS tope FROM public.viviendas WHERE id = $1',
          [viviendaId],
        )
      )?.tope,
    ).toBe(5);
    const ocupada = anadidas.body.find((p: { numero: number }) => p.numero === 2);
    const retiro = await comoSuper('post', `${ruta}/${String(ocupada.id)}/retiro`).send({
      motivo: 'se mudó a otra ciudad',
    });
    expect(retiro.status).toBe(200);
    const fam = await con(primero).get(`/copropiedades/${COP_A}/mi/familia`);
    // Eran cuatro: quitar la plaza 2 da de baja a quien la ocupaba.
    expect(fam.body.filter((m: { activo: boolean }) => m.activo)).toHaveLength(3);
    const rastro = await uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.bitacora_de_residentes
        WHERE vivienda_id = $1 AND tipo IN ('plaza_anadida', 'plaza_retirada') AND actor_id = $2`,
      [viviendaId, SUPER],
    );
    expect(rastro?.n).toBe('2');
  });
});
