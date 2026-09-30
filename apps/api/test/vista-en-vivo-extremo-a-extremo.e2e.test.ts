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
// V5 · tres equipos más de A en el banco, cada uno con un fallo de video distinto.
const EN_H265 = '90000000-0000-4000-8000-000000000001';
const SIN_ESE_CANAL = '90000000-0000-4000-8000-0000000000ff';
const CLAVE_MALA = '00000000-0000-4000-8000-0000000000ff';
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
        canales: { '101': 'H264', '201': 'H265' },
        // La cámara del 29/09: a un canal que no tiene contesta 412.
        estadoSinCanal: '412 Precondition Failed',
      });
      const equipo = (dispositivoId: string, canalDeVideo: string, clave = CLAVE) => ({
        dispositivoId,
        tipo: 'intercom' as const,
        host: '127.0.0.1',
        puerto: 80,
        protocolo: 'http' as const,
        usuario: 'servicio',
        clave,
        canalDeVideo,
      });
      const registro = new RegistroEnMemoria([
        equipo(EQUIPO, '101'),
        equipo(EN_H265, '201'),
        equipo(SIN_ESE_CANAL, '102'),
        equipo(CLAVE_MALA, '101', 'otra-clave-que-tampoco-debe-salir'),
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

    const whep = (oferta: string, dispositivo = EQUIPO) =>
      request(app.getHttpServer())
        .post(`/copropiedades/${COP_A}/guardia/video/${dispositivo}/whep`)
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

    /**
     * V5 (15-N) · go2rtc contesta lo mismo («wrong response on DESCRIBE») a un
     * canal que no existe, a un usuario sin permiso y a sesiones agotadas; y
     * con H.265 contesta 201 con el video inactivo. La API pregunta al equipo
     * y lo dice en palabras, con el canal y el código.
     */
    it('V5 · canal que el equipo no tiene (412): 502 con el canal y el código, no «EOF»', async () => {
      const res = await whep(OFERTA_SDP_DE_NAVEGADOR, SIN_ESE_CANAL);
      expect(res.status).toBe(502);
      expect(JSON.stringify(res.body)).toMatch(/no tiene el canal 102 \(RTSP 412\)/);
    }, 30_000);

    it('V5 · equipo en H.265: 502 «códec», en vez de un reproductor negro', async () => {
      const res = await whep(OFERTA_SDP_DE_NAVEGADOR, EN_H265);
      expect(res.status).toBe(502);
      expect(JSON.stringify(res.body)).toMatch(/H\.265 en el canal 201/);
    }, 30_000);

    it('V5 · credencial RTSP rechazada: en palabras y sin la clave', async () => {
      const res = await whep(OFERTA_SDP_DE_NAVEGADOR, CLAVE_MALA);
      expect(res.status).toBe(502);
      const cuerpo = JSON.stringify(res.body);
      expect(cuerpo).toMatch(/rechazó la credencial por RTSP/);
      expect(cuerpo).not.toContain('otra-clave-que-tampoco-debe-salir');
      expect(cuerpo).not.toContain(CLAVE);
    }, 30_000);
  },
);
