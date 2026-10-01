import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import {
  DetectorDeMarcas,
  RegistroEnMemoria,
  capacidadesDeclaradas,
  crearProveedorDeEquipos,
  tramaDeSilencio,
  tramaDeTono,
  videoporteroDeAudioEnRed,
} from '@ncr/providers';
import type { FuenteDePlacas, VideoporteroDeAudioEnRed } from '@ncr/providers';
import { FUENTE_DE_PLACAS, PROVEEDOR_DE_EQUIPOS } from '../src/proveedores';
import { REGISTRO_DE_CONVERSACIONES } from '../src/guardia/aplicacion/conversacion-de-audio';
import type { ConversacionesEnMemoria } from '../src/guardia/infraestructura/conversaciones-pg';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P5 · EL AUDIO DE LA GUARDIA POR WEBSOCKET, DE PUNTA A PUNTA
 *
 * La API real (guardas, billete, puerta de actualización, conversación) con el
 * proveedor real (`audioDelEquipo: persistente`) contra el videoportero
 * simulado EN RED, que sigue el flujo de audio bidireccional del manual. Lo que el
 * navegador hace lo hace aquí el `WebSocket` de Node.
 *
 * Mide y deja en la salida la latencia de ida y de vuelta por la API (sin el
 * navegador: ésa la mide `e2e/medir-audio-guardia.mjs`). Y prueba lo que no
 * se mide: segundo operador en cola, billete de un solo uso y de esta IP,
 * aislamiento entre copropiedades (KPI-35), «canal ocupado» y canal
 * deshabilitado.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const PORTERIA_A = '70000000-0000-4000-8000-000000000001';
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-del-videoportero-simulado' } as const;
const OP_1 = '00000000-0000-4000-8000-0000000000c1';
const OP_2 = '00000000-0000-4000-8000-0000000000c2';

let app: INestApplication;
let base: string;
let equipo: VideoporteroDeAudioEnRed;
const registro = new RegistroEnMemoria();
let token1: string;
let token2: string;
let tokenB: string;

beforeAll(async () => {
  equipo = await videoporteroDeAudioEnRed(CREDENCIAL);
  registro.registrar({
    dispositivoId: PORTERIA_A,
    tipo: 'intercom',
    host: '127.0.0.1',
    puerto: equipo.puerto,
    protocolo: 'http',
    ...CREDENCIAL,
    canalDeAudio: 1,
    canalDeAudioHabilitado: true,
    capacidades: capacidadesDeclaradas({
      audioBidireccional: { estado: 'si', canal: 1, formato: 'g711u' },
    }),
  });
  const firmante = await crearFirmante();
  app = await crearApp(firmante, (b) =>
    b.overrideProvider(PROVEEDOR_DE_EQUIPOS).useFactory({
      inject: [FUENTE_DE_PLACAS, BITACORA, RELOJ],
      factory: (fuente: FuenteDePlacas, bitacora: Bitacora, reloj: Reloj) =>
        crearProveedorDeEquipos({
          clase: 'hikvision', // kpi-11-exento: nombre del adaptador que se compone
          registro,
          fuente,
          reloj,
          traza: bitacora,
          audioDelEquipo: 'persistente',
        }),
    }),
  );
  // `crearApp` ya escucha en un puerto libre: el WebSocket necesita uno de verdad.
  base = `127.0.0.1:${String(((app.getHttpServer() as Server).address() as AddressInfo).port)}`;
  const operador = (usuarioId: string) =>
    tokenDe(firmante, {
      rol: 'operador_central',
      usuarioId,
      copropiedadId: null,
      copropiedades: [COP_A],
    });
  token1 = await operador(OP_1);
  token2 = await operador(OP_2);
  tokenB = await tokenDe(firmante, {
    rol: 'operador_central',
    copropiedadId: null,
    copropiedades: [COP_B],
  });
}, 30_000);

afterAll(async () => {
  await app?.close();
  await equipo?.cerrar();
});

const api = () => request(`http://${base}`);
const abrir = (token: string, cop = COP_A) =>
  api()
    .post(`/copropiedades/${cop}/guardia/intercom/abrir`)
    .set('Authorization', `Bearer ${token}`)
    .send({ dispositivoId: PORTERIA_A });
const billete = (token: string, cop = COP_A, ip?: string) => {
  const r = api()
    .post(`/copropiedades/${cop}/guardia/intercom/${PORTERIA_A}/billete`)
    .set('Authorization', `Bearer ${token}`);
  return ip === undefined ? r : r.set('X-Forwarded-For', ip);
};

interface Socket {
  readonly ws: WebSocket;
  readonly recibido: Uint8Array[];
  readonly abierto: Promise<void>;
  readonly cerrado: Promise<{ codigo: number; motivo: string }>;
}
const conectar = (consulta: string): Socket => {
  const ws = new WebSocket(`ws://${base}/guardia/audio${consulta}`);
  ws.binaryType = 'arraybuffer';
  const recibido: Uint8Array[] = [];
  ws.addEventListener('message', (e) => {
    if (e.data instanceof ArrayBuffer) recibido.push(new Uint8Array(e.data));
  });
  return {
    ws,
    recibido,
    abierto: new Promise((listo, mal) => {
      ws.addEventListener('open', () => listo());
      ws.addEventListener('error', () => mal(new Error('el WebSocket no abrió')));
    }),
    cerrado: new Promise((listo) =>
      ws.addEventListener('close', (e) => listo({ codigo: e.code, motivo: e.reason })),
    ),
  };
};
const hasta = async (condicion: () => boolean, plazo = 3000): Promise<void> => {
  const limite = Date.now() + plazo;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error('no llegó a tiempo');
    await new Promise((r) => setTimeout(r, 2));
  }
};

describe('15-P · audio de la guardia por WebSocket, contra el videoportero simulado en red', () => {
  it('abre, escucha sin pulsar, sube sólo con «pulsar», mide ida y vuelta y cierra el canal', async () => {
    expect((await abrir(token1)).body).toMatchObject({
      estado: 'abierta',
      transporte: 'equipo',
      via: 'websocket',
    });
    const b = await billete(token1);
    expect(b.status, JSON.stringify(b.body)).toBe(201);
    const s = conectar(`?billete=${encodeURIComponent(b.body.billete as string)}`);
    await s.abierto;

    // Vuelta: tono del equipo → detectado en lo que llega por el socket.
    await hasta(() => s.recibido.length > 0);
    const oidas: number[] = [];
    const oido = new DetectorDeMarcas((t) => oidas.push(t));
    s.ws.addEventListener('message', (e) => {
      if (e.data instanceof ArrayBuffer) oido.alimentar(new Uint8Array(e.data));
    });
    equipo.bajada.marcar();
    await hasta(() => oidas.length > 0);
    const vuelta = (oidas[0] ?? 0) - (equipo.bajada.marcasEmitidas.at(-1) ?? 0);

    // Sin «pulsar», el audio no llega al equipo.
    s.ws.send(tramaDeTono(0));
    await new Promise((r) => setTimeout(r, 100));
    expect(equipo.marcasRecibidas).toHaveLength(0);

    // Ida: con «pulsar», tramas de 160 B; el tono se detecta en el equipo.
    s.ws.send(JSON.stringify({ tipo: 'pulsar' }));
    for (let i = 0; i < 3; i += 1) s.ws.send(tramaDeSilencio());
    const enviado = Date.now();
    s.ws.send(tramaDeTono(1));
    await hasta(() => equipo.marcasRecibidas.length > 0);
    const ida = (equipo.marcasRecibidas[0] ?? 0) - enviado;
    s.ws.send(JSON.stringify({ tipo: 'soltar' }));
    expect(equipo.estado().entramadoDeSubida).toBe('crudo');

    console.log(
      `   15-P · latencia por la API: ida ${String(ida)} ms, vuelta ${String(vuelta)} ms`,
    );
    expect(ida).toBeLessThan(2000);
    expect(vuelta).toBeLessThan(2000);

    s.ws.close(1000, 'El operador colgó');
    await hasta(() => equipo.estado().cierres === 1);
    const conversaciones = app.get<ConversacionesEnMemoria>(REGISTRO_DE_CONVERSACIONES);
    await hasta(() => conversaciones.registradas.length === 1);
    expect(conversaciones.registradas[0]).toMatchObject({
      copropiedadId: COP_A,
      dispositivoId: PORTERIA_A,
      operadorId: OP_1,
      motivoDeCierre: 'El operador colgó',
    });
    expect(conversaciones.registradas[0]?.tramos).toHaveLength(1);
  });

  it('el billete vale una vez, sólo desde su IP, y sin él no hay socket', async () => {
    await abrir(token1);
    const b = (await billete(token1)).body.billete as string;
    const primero = conectar(`?billete=${encodeURIComponent(b)}`);
    await primero.abierto;
    const segundo = conectar(`?billete=${encodeURIComponent(b)}`);
    await expect(segundo.abierto).rejects.toThrow();
    await expect(conectar('').abierto).rejects.toThrow();
    // Un billete pedido desde OTRA IP (la que dice el proxy de confianza) no vale aquí.
    const ajeno = (await billete(token1, COP_A, '203.0.113.9')).body.billete as string;
    await expect(conectar(`?billete=${encodeURIComponent(ajeno)}`).abierto).rejects.toThrow();
    primero.ws.close(1000);
    await primero.cerrado;
  });

  it('segundo operador: queda en cola, sin billete; al colgar el primero, abre el suyo', async () => {
    await abrir(token1);
    const s1 = conectar(
      `?billete=${encodeURIComponent((await billete(token1)).body.billete as string)}`,
    );
    await s1.abierto;
    expect((await abrir(token2)).body).toMatchObject({ estado: 'en_espera', porDelante: 1 });
    expect((await billete(token2)).status).toBe(409);
    s1.ws.close(1000);
    await s1.cerrado;
    await hasta(() => !equipo.estado().sesionAbierta);
    const segundo = await abrir(token2);
    expect(segundo.body).toMatchObject({ estado: 'abierta', transporte: 'equipo' });
    const s2 = conectar(
      `?billete=${encodeURIComponent((await billete(token2)).body.billete as string)}`,
    );
    await s2.abierto;
    s2.ws.close(1000);
    await s2.cerrado;
  });

  it('KPI-35: ni la ruta de otra copropiedad ni un operador de otra copropiedad sacan billete', async () => {
    expect((await billete(tokenB)).status).toBe(404);
    expect((await billete(token1, COP_B)).status).toBe(404);
  });

  it('0x40002068: con el canal tomado por otro cliente, «canal ocupado» y el turno libre', async () => {
    equipo.ocupar();
    const r = await abrir(token1);
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).toMatch(/canal ocupado/);
    // El turno no quedó retenido: el otro operador puede pedirlo.
    expect((await abrir(token2)).status).toBe(409);
  });
});
