import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import {
  OFERTA_SDP_DE_NAVEGADOR,
  OMITIDA_SIN_BINARIO,
  RegistroEnMemoria,
  arrancarGo2rtc,
  binarioGo2rtc,
  crearProveedorDeEquipos,
  servidorRtspSimulado,
} from '@ncr/providers';
import type { FuenteDePlacas, Go2rtcDePruebas, ServidorRtspSimulado } from '@ncr/providers';
import { FUENTE_DE_PLACAS, PROVEEDOR_DE_EQUIPOS } from '../src/proveedores';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * V1 (15-N) · LA VISTA EN VIVO DE EXTREMO A EXTREMO, POR HTTP
 *
 * La oferta de un navegador entra por la tubería de `main.ts` —la misma
 * función, `montarTuberiaHttp`: contexto, seguridad, parsers, SANEAMIENTO—,
 * pasa por el controlador WHEP y el caso de uso, y llega a go2rtc REAL, que
 * toma el RTSP de un equipo simulado y contesta. El oráculo es la respuesta
 * SDP que vuelve al cliente.
 *
 * Con el código de la 15-M esta prueba falla con 502: el saneamiento global
 * recortaba la oferta (`.trim()` le quita el CRLF final), go2rtc la rechazaba
 * con «EOF» en `webrtc.go:272` y la consola no vio video en ningún equipo
 * (Bloque 0). La prueba de la 15-M llamaba al puente directamente y no lo vio.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const binario = binarioGo2rtc();
const EQUIPO = '70000000-0000-4000-8000-000000000001'; // «Portería de A», un intercom
const CLAVE = 'clave-rtsp-que-no-debe-salir';

describe.skipIf(binario === null)(
  `V1 · oferta del navegador → API (tubería de main.ts) → go2rtc real → SDP (${binario === null ? OMITIDA_SIN_BINARIO : 'binario de GO2RTC_BIN'})`,
  () => {
    let puente: Go2rtcDePruebas;
    let equipoRtsp: ServidorRtspSimulado;
    let app: INestApplication;
    let token = '';

    beforeAll(async () => {
      puente = await arrancarGo2rtc(binario ?? '');
      equipoRtsp = await servidorRtspSimulado({
        usuario: 'servicio',
        clave: CLAVE,
        canales: { '101': 'H264' },
      });
      const registro = new RegistroEnMemoria([
        {
          dispositivoId: EQUIPO,
          tipo: 'intercom',
          host: '127.0.0.1',
          puerto: 80,
          protocolo: 'http',
          usuario: 'servicio',
          clave: CLAVE,
          canalDeVideo: '101',
        },
      ]);
      const firmante = await crearFirmante();
      app = await crearApp(
        firmante,
        (b) =>
          b.overrideProvider(PROVEEDOR_DE_EQUIPOS).useFactory({
            inject: [FUENTE_DE_PLACAS, BITACORA, RELOJ],
            factory: (fuente: FuenteDePlacas, bitacora: Bitacora, reloj: Reloj) =>
              crearProveedorDeEquipos({
                clase: 'hikvision', // kpi-11-exento: nombre del adaptador que se compone
                registro,
                puertoRtsp: equipoRtsp.puerto,
                fuente,
                reloj,
                traza: bitacora,
              }),
          }),
        { GO2RTC_URL: puente.url },
      );
      token = await tokenDe(firmante, {
        rol: 'operador_central',
        copropiedadId: null,
        copropiedades: [COP_A],
      });
    }, 30_000);

    afterAll(async () => {
      await app?.close();
      await puente?.cerrar();
      await equipoRtsp?.cerrar();
    });

    const whep = (oferta: string) =>
      request(app.getHttpServer())
        .post(`/copropiedades/${COP_A}/guardia/video/${EQUIPO}/whep`)
        .set('Authorization', `Bearer ${token}`)
        .set('content-type', 'application/sdp')
        .send(oferta);

    it('la oferta del navegador, con su CRLF final, vuelve como respuesta SDP (201)', async () => {
      expect(OFERTA_SDP_DE_NAVEGADOR.endsWith('\r\n')).toBe(true);
      const res = await whep(OFERTA_SDP_DE_NAVEGADOR);
      expect(res.status, JSON.stringify(res.body ?? res.text)).toBe(201);
      expect(res.headers['content-type']).toMatch(/^application\/sdp/);
      expect(res.text.startsWith('v=0')).toBe(true);
      expect(res.text).toMatch(/a=rtpmap:\d+ H264\/90000/);
      expect(res.text).not.toContain(CLAVE);
      // go2rtc llegó al equipo: la negociación pasó del SDP al RTSP.
      expect(equipoRtsp.metodos()).toContain('DESCRIBE');
    }, 30_000);

    it('una oferta sin CRLF final (cliente que no es navegador) también negocia: el puente lo repone', async () => {
      const res = await whep(OFERTA_SDP_DE_NAVEGADOR.trimEnd());
      expect(res.status, JSON.stringify(res.body ?? res.text)).toBe(201);
      expect(res.text.startsWith('v=0')).toBe(true);
    }, 30_000);
  },
);
