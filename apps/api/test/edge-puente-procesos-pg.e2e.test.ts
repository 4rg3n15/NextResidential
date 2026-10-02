import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
// El montaje PRIMERO: trae `utilidades`, que carga `AppModule` en su orden.
import {
  CLAVE_SIM,
  COP_SEMILLA,
  SUFIJO,
  VP,
  alta,
  api,
  como,
  dod,
  guardian,
  hasta,
  montarDoD,
  token,
} from './edge-hijo/montaje-del-dod';
import { direccionDe, tokenDe } from './utilidades';
import { OFERTA_SDP_DE_NAVEGADOR } from '@ncr/providers';
import { medirAudio, viviendaConPlaca, visitaConFoto } from './edge-hijo/acciones-del-dod';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · DoD · LA API EN LA NUBE, EL EDGE EN EL CONJUNTO, Y NADA MÁS
 *
 * Dos procesos (`edge-hijo/montaje-del-dod.ts`). En éste, la API real contra
 * PostgreSQL; su proveedor DIRECTO es un GUARDIÁN que anota cualquier intento de
 * hablar con un equipo, y el `fetch` del proceso también lo vigila. En el otro,
 * el Edge puente real con los equipos simulados, que sólo él alcanza.
 * ═════════════════════════════════════════════════════════════════════════════
 */
montarDoD(URL_BASE);
exigirBase('sin DATABASE_URL_PRUEBAS', () => dod.disponible);

describe.skipIf(URL_BASE === undefined)('15-Q2 · DoD · API y Edge en procesos distintos', () => {
  it('A1/A3 · el túnel está abierto: /ready lo cuenta y la ficha dice «conectado»', async () => {
    const listo = await api().get('/ready');
    expect(listo.body.avisos?.edge).toMatch(/^[1-9]\d* conectado/);
    const ficha = await (
      await como('administrador')
    ).get(`/copropiedades/${dod.cop}/edge-gateways`);
    expect(ficha.body).toEqual([
      expect.objectContaining({ id: dod.edgeId, puente: true, conectado: true }),
    ]);
  });

  it('D3 · la credencial heredada se muda: el Edge autentica y SÓLO entonces la nube la borra', async () => {
    const r = await (
      await como('superadministrador')
    ).post(`/copropiedades/${dod.cop}/edge-gateways/${dod.edgeId}/migrar-credenciales`);
    expect(r.body).toEqual([
      expect.objectContaining({ dispositivoId: dod.equipo.heredada, trasladada: true }),
    ]);
    const { rows } = await (dod.pool as Pool).query(
      `SELECT iv, cuerpo, etiqueta, estado::text, trasladada_al_edge FROM public.credenciales_de_equipo
        WHERE dispositivo_id = $1`,
      [dod.equipo.heredada],
    );
    expect(rows).toEqual([
      {
        iv: null,
        cuerpo: null,
        etiqueta: null,
        estado: 'inactivo',
        trasladada_al_edge: dod.edgeId,
      },
    ]);
  });

  it('D2 · alta con credencial: la sonda corre en el Edge y la clave NO queda en la nube', async () => {
    const camara = await alta({
      nombre: 'Cámara',
      tipo: 'camara_lpr',
      puerto: 8001,
      usuario: 'servicio',
      secreto: CLAVE_SIM,
      canalBarrera: 1,
    });
    const terminal = await alta({
      nombre: 'Terminal',
      tipo: 'terminal_facial',
      puerto: 8002,
      usuario: 'servicio',
      secreto: CLAVE_SIM,
      modoDeTerminal: 'reporta_y_espera',
    });
    const portero = await alta({
      nombre: 'Videoportero',
      tipo: 'intercom',
      puerto: dod.hijo?.puertoDelVideoportero,
      usuario: VP.usuario,
      secreto: VP.clave,
      canalDeAudio: 1,
      canalDeAudioHabilitado: true,
      // El videoportero simulado en red sólo sirve el audio: pide Digest hasta en la
      // consulta de activación, y el diagnóstico lo leería como credencial mala. Su
      // credencial la prueba E1, que abre el audio con la que sólo el Edge tiene.
      probarConexion: false,
    });
    dod.equipo.camara = camara.body.id as string;
    dod.equipo.terminal = terminal.body.id as string;
    dod.equipo.portero = portero.body.id as string;
    dod.secretoCamara = camara.body.secretoDelAlarmServer as string;
    for (const r of [camara, terminal, portero]) expect(r.status, JSON.stringify(r.body)).toBe(201);
    for (const r of [camara, terminal]) {
      expect(r.body.verificacion, JSON.stringify(r.body.sondeo ?? r.body)).toBe('verificado');
    }

    const nube = await (dod.pool as Pool).query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.credenciales_de_equipo
        WHERE dispositivo_id = ANY($1) AND (iv IS NOT NULL OR cuerpo IS NOT NULL)`,
      [[dod.equipo.camara, dod.equipo.terminal, dod.equipo.portero, dod.equipo.heredada]],
    );
    expect(nube.rows[0]?.n).toBe('0');
    const refs = await (dod.pool as Pool).query<{ credencial_ref: string; huella: boolean }>(
      `SELECT credencial_ref, huella_de_credencial IS NOT NULL AS huella FROM public.dispositivos
        WHERE id = ANY($1)`,
      [[dod.equipo.camara, dod.equipo.terminal, dod.equipo.portero]],
    );
    expect(refs.rows).toEqual(
      Array(3).fill({ credencial_ref: `edge:${dod.edgeId}`, huella: true }),
    );
    // D1 · ni en el SQLite del Edge aparece la clave en claro.
    // Control positivo: el identificador SÍ está en claro, así que el lector ve lo recién escrito.
    expect((await dod.hijo?.sqlite([dod.equipo.camara, CLAVE_SIM, VP.clave]))?.contiene).toEqual([
      dod.equipo.camara,
    ]);
  });

  it('C · abrir desde la consola: la orden llega a la barrera por el túnel', async () => {
    const antes = (await dod.hijo?.estado())?.aperturas ?? 0;
    const r = await (
      await como('administrador')
    ).post(`/copropiedades/${dod.cop}/guardia/ordenes`, {
      dispositivoId: dod.equipo.camara,
      accion: 'abrir',
      motivo: 'Prueba de la DoD 15-Q2',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.resultado).toBe('aceptada');
    expect((await dod.hijo?.estado())?.aperturas).toBe(antes + 1);
  });

  it('B · con la nube viva decide la nube, y la barrera recibe UNA orden por acceso', async () => {
    const placa = await viviendaConPlaca();
    const antes = (await dod.hijo?.estado())?.aperturas ?? 0;
    expect((await dod.hijo?.publicar(placa, `dod2-${SUFIJO}-1`, dod.secretoCamara))?.estado).toBe(
      200,
    );
    await hasta(async () => (await dod.hijo?.estado())?.aperturas === antes + 1);
    await new Promise((r) => setTimeout(r, 1500));
    expect((await dod.hijo?.estado())?.aperturas).toBe(antes + 1);
    const { rows } = await (dod.pool as Pool).query<{ n: string; edge: boolean }>(
      `SELECT count(*)::text AS n, bool_or(decidido_por_edge) AS edge FROM public.eventos
        WHERE copropiedad_id = $1 AND clave_idempotencia LIKE $2`,
      [dod.cop, `%:dod2-${SUFIJO}-1`],
    );
    expect(rows[0]).toEqual({ n: '1', edge: false });
  });

  it('E2 · la negociación de video la hace el go2rtc del Edge; la URL con credencial no sale', async () => {
    const r = await api()
      .post(`/copropiedades/${dod.cop}/guardia/video/${dod.equipo.portero}/whep`)
      .set(
        'Authorization',
        `Bearer ${await token('operador_central', { copropiedadId: null, copropiedades: [dod.cop] })}`,
      )
      .set('content-type', 'application/sdp')
      .send(OFERTA_SDP_DE_NAVEGADOR);
    expect(r.status, r.text).toBe(201);
    expect(r.text.startsWith('v=0')).toBe(true);
    const go2rtc = (await dod.hijo?.estado())?.go2rtc;
    expect(go2rtc?.ofertas).toBeGreaterThanOrEqual(1);
    expect(go2rtc?.fuentes.at(-1)).toMatch(/^rtsp:\/\//);
    expect(r.text).not.toContain(VP.clave);
  });

  it('C2 · sincronizar y suprimir un rostro por el túnel (con consentimiento; el Edge no lo guarda)', async () => {
    const r = await visitaConFoto();
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const enLaTerminal = (
      r.body.porEquipo as { dispositivoId: string; sincronizada: boolean }[]
    ).find((e) => e.dispositivoId === dod.equipo.terminal);
    expect(enLaTerminal?.sincronizada, JSON.stringify(r.body)).toBe(true);
    // La foto viajó por el túnel y el Edge NO la guardó (ni en el SQLite ni en su WAL).
    expect((await dod.hijo?.sqlite(['JFIF']))?.contiene).toEqual([]);
    const rechazo = await (
      await como('superadministrador')
    ).post(`/copropiedades/${dod.cop}/visitas/${String(r.body.autorizacionId)}/rechazo`, {
      motivo: 'Prueba de supresión de la DoD 15-Q2',
    });
    expect(rechazo.status, JSON.stringify(rechazo.body)).toBe(201);
    expect(rechazo.body.equiposPendientes).toBe(0);
    expect(rechazo.body.equiposRetirados, JSON.stringify(rechazo.body)).toBeGreaterThanOrEqual(1);
  });

  it('E1 · audio navegador ↔ API ↔ túnel ↔ Edge ↔ videoportero: ida y vuelta < 2 s', async () => {
    const { ida, vuelta, abierta } = await medirAudio();
    expect(abierta, JSON.stringify(abierta)).toMatchObject({ estado: 'abierta' });
    console.log(
      `   15-Q2 · audio por el túnel: ida ${String(ida)} ms, vuelta ${String(vuelta)} ms`,
    );
    expect(ida).toBeLessThan(2000);
    expect(vuelta).toBeLessThan(2000);
  });

  it('C3 · con el túnel caído: las órdenes de la consola fallan con su motivo y el Edge decide solo', async () => {
    await dod.hijo?.wan(false);
    await hasta(async () => (await api().get('/ready')).body.avisos?.edge === '0 conectado(s)');
    const prueba = await (
      await como('administrador')
    ).post(`/copropiedades/${dod.cop}/equipos/prueba-de-conexion`, {
      nombre: 'x',
      tipo: 'camara_lpr',
      host: '127.0.0.1',
      puerto: 8001,
      protocolo: 'http',
      usuario: 'servicio',
      secreto: CLAVE_SIM,
    });
    expect(prueba.status).toBe(503);
    expect(prueba.body.mensaje).toMatchObject({ codigo: 'EDGE_NO_DISPONIBLE' });
    const orden = await (
      await como('administrador')
    ).post(`/copropiedades/${dod.cop}/guardia/ordenes`, {
      dispositivoId: dod.equipo.camara,
      accion: 'abrir',
      motivo: 'Con el túnel caído',
    });
    expect(JSON.stringify(orden.body)).toContain('el Edge del conjunto no está conectado');
  });

  it('el Edge sin túnel decide con su caché, y al volver reconcilia EXACTAMENTE una vez', async () => {
    const t0 = Date.now();
    for (let i = 0; i < 3; i += 1) {
      expect(
        (
          await dod.hijo?.publicar(
            `SIN${String(100 + i)}`,
            `dod2-${SUFIJO}-sin-${String(i)}`,
            dod.secretoCamara,
          )
        )?.estado,
      ).toBe(200);
    }
    expect((await dod.hijo?.estado())?.pendientes).toBe(3);
    await dod.hijo?.wan(true);
    await hasta(async () => (await dod.hijo?.estado())?.tunel === true, 15_000);
    await hasta(async () => {
      await dod.hijo?.tic(new Date());
      return (await dod.hijo?.estado())?.pendientes === 0;
    }, 15_000);
    const { rows } = await (dod.pool as Pool).query<{ n: string; distintos: string }>(
      `SELECT count(*)::text AS n, count(DISTINCT clave_idempotencia)::text AS distintos
         FROM public.eventos WHERE copropiedad_id = $1 AND clave_idempotencia LIKE $2 AND ocurrido_en >= $3`,
      [dod.cop, `%:dod2-${SUFIJO}-sin-%`, new Date(t0 - 60_000)],
    );
    expect(rows[0]).toEqual({ n: '3', distintos: '3' });
  }, 60_000);

  it('KPI-36/37 · un Edge que dice servir OTRA copropiedad no abre túnel, y otra copropiedad no ve la ficha', async () => {
    const ajena = await tokenDe(dod.firmante, { rol: 'administrador' });
    const ficha = await api()
      .get(`/copropiedades/${dod.cop}/edge-gateways`)
      .set('Authorization', `Bearer ${ajena}`);
    expect([403, 404]).toContain(ficha.status);
    expect(
      await dod.hijo?.holaAjeno(
        direccionDe(dod.app as INestApplication),
        dod.edgeId,
        dod.secretoEdge,
        COP_SEMILLA,
      ),
    ).toBe(4404);
  });

  it('el guardián: la API no intentó hablar con NINGÚN equipo de este conjunto', () => {
    const delConjunto = new Set(Object.values(dod.equipo));
    expect(guardian.violaciones.filter((v) => delConjunto.has(v) || v.startsWith('red:'))).toEqual(
      [],
    );
  });
});
