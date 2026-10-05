import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import {
  RegistroEnMemoria,
  capacidadesDeclaradas,
  crearProveedorDeEquipos,
  tramaDeSilencio,
  videoporteroDeAudioEnRed,
} from '@ncr/providers';
import type { FuenteDePlacas, ProveedorDeEquipos, VideoporteroDeAudioEnRed } from '@ncr/providers';
import { FUENTE_DE_PLACAS, PROVEEDOR_DE_EQUIPOS } from '../src/proveedores';
import { REGISTRO_DE_CONVERSACIONES } from '../src/guardia/aplicacion/conversacion-de-audio';
import type { ConversacionTerminada } from '../src/guardia/aplicacion/conversacion-de-audio';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-S1 · A1 · COLGAR Y VOLVER A LLAMAR ENSEGUIDA NO PIERDE EL TURNO NUEVO
 *
 * La carrera de la 15-P, por ORDEN DE EVENTOS y no por tiempos: la API real
 * (guardas, billete, puerta del WebSocket, conversación, canal) con el
 * proveedor real contra el videoportero simulado en red. Lo único que la
 * prueba gobierna es el equipo: retiene UNA trama de subida —«todavía no la
 * aceptó»—, que es lo que hace que la conversación vieja termine DESPUÉS:
 *
 *   1. el operador llama (turno 1), escucha y habla: la trama queda retenida;
 *   2. cuelga: el equipo cierra, y la conversación vieja empieza a terminar y
 *      se queda esperando su trama;
 *   3. vuelve a llamar: turno 2, el MISMO equipo y el MISMO operador;
 *   4. el equipo acepta por fin la trama y la conversación vieja termina.
 *
 * Soltando por equipo y operador, en 4 se llevaba el turno 2 y cerraba el
 * canal en el equipo. Soltando por sesión no toca nada: la suya era la 1.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const PORTERIA_A = '70000000-0000-4000-8000-000000000001';
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-del-videoportero-simulado' } as const;
const OP_1 = '00000000-0000-4000-8000-0000000000c1';

let app: INestApplication;
let base: string;
let equipo: VideoporteroDeAudioEnRed;
let token: string;
const registro = new RegistroEnMemoria();

/** La subida que el equipo retiene: se arma, se ve llegar y se suelta. */
const subida = {
  armada: false,
  soltar: (): void => undefined,
  alRetener: (): void => undefined,
};
const tramaRetenida = (): Promise<void> =>
  new Promise((listo) => {
    subida.armada = true;
    subida.alRetener = listo;
  });

/** El proveedor real, salvo `enviarAudioA`: con la subida armada, espera a la prueba. */
const conSubidaRetenible = (real: ProveedorDeEquipos): ProveedorDeEquipos =>
  new Proxy(real, {
    get: (objetivo, clave) => {
      if (clave === 'enviarAudioA') {
        return async (dispositivoId: string, fragmento: Uint8Array): Promise<void> => {
          if (!subida.armada) return objetivo.enviarAudioA?.(dispositivoId, fragmento);
          subida.armada = false;
          await new Promise<void>((listo) => {
            subida.soltar = listo;
            subida.alRetener();
          });
        };
      }
      const valor: unknown = Reflect.get(objetivo, clave);
      return typeof valor === 'function' ? valor.bind(objetivo) : valor;
    },
  });

/** La constancia de cada conversación, avisando al llegar: el fin de la vieja es un evento. */
const registradas: ConversacionTerminada[] = [];
let alRegistrar: (c: ConversacionTerminada) => void = () => undefined;
const proximaConstancia = (): Promise<ConversacionTerminada> =>
  new Promise((listo) => {
    alRegistrar = listo;
  });

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
    b
      .overrideProvider(PROVEEDOR_DE_EQUIPOS)
      .useFactory({
        inject: [FUENTE_DE_PLACAS, BITACORA, RELOJ],
        factory: (fuente: FuenteDePlacas, bitacora: Bitacora, reloj: Reloj) =>
          conSubidaRetenible(
            crearProveedorDeEquipos({
              clase: 'hikvision', // kpi-11-exento: nombre del adaptador que se compone
              registro,
              fuente,
              reloj,
              traza: bitacora,
              audioDelEquipo: 'persistente',
            }),
          ),
      })
      .overrideProvider(REGISTRO_DE_CONVERSACIONES)
      .useValue({
        registrar: async (c: ConversacionTerminada) => {
          registradas.push(c);
          alRegistrar(c);
        },
      }),
  );
  base = `127.0.0.1:${String(((app.getHttpServer() as Server).address() as AddressInfo).port)}`;
  token = await tokenDe(firmante, {
    rol: 'operador_central',
    usuarioId: OP_1,
    copropiedadId: null,
    copropiedades: [COP_A],
  });
}, 30_000);

afterAll(async () => {
  subida.soltar();
  await app?.close();
  await equipo?.cerrar();
});

const api = () => request(`http://${base}`);
const intercom = (accion: 'abrir' | 'cerrar') =>
  api()
    .post(`/copropiedades/${COP_A}/guardia/intercom/${accion}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ dispositivoId: PORTERIA_A });
const estado = () =>
  api()
    .get(`/copropiedades/${COP_A}/guardia/intercom/${PORTERIA_A}`)
    .set('Authorization', `Bearer ${token}`);
const billete = () =>
  api()
    .post(`/copropiedades/${COP_A}/guardia/intercom/${PORTERIA_A}/billete`)
    .set('Authorization', `Bearer ${token}`);

/** El socket de la consola: abre, avisa con la primera trama del equipo y al cerrarse. */
const conectar = async (): Promise<{
  readonly ws: WebSocket;
  readonly escuchando: Promise<void>;
  readonly cerrado: Promise<number>;
}> => {
  const b = await billete();
  expect(b.status, JSON.stringify(b.body)).toBe(201);
  const ws = new WebSocket(
    `ws://${base}/guardia/audio?billete=${encodeURIComponent(b.body.billete as string)}`,
  );
  ws.binaryType = 'arraybuffer';
  return {
    ws,
    escuchando: new Promise((listo) =>
      ws.addEventListener('message', (e) => {
        if (e.data instanceof ArrayBuffer) listo();
      }),
    ),
    cerrado: new Promise((listo) => ws.addEventListener('close', (e) => listo(e.code))),
  };
};

describe('15-S1 · A1 · el turno de audio se suelta por sesión, no por equipo y operador', () => {
  it('colgar y volver a llamar: el final tardío de la conversación vieja no toca el turno nuevo', async () => {
    // 1 · llama, escucha y habla: el equipo retiene la trama.
    expect((await intercom('abrir')).body).toMatchObject({
      estado: 'abierta',
      transporte: 'equipo',
    });
    const vieja = await conectar();
    await vieja.escuchando;
    const retenida = tramaRetenida();
    vieja.ws.send(JSON.stringify({ tipo: 'pulsar' }));
    vieja.ws.send(tramaDeSilencio());
    await retenida;

    // 2 · cuelga: el equipo cierra y la conversación vieja corta, esperando su trama.
    expect((await intercom('cerrar')).body).toMatchObject({ estado: 'cerrada' });
    expect(await vieja.cerrado).toBe(4010);
    expect(equipo.estado()).toMatchObject({ cierres: 1, sesionAbierta: false });
    expect(registradas).toHaveLength(0);

    // 3 · vuelve a llamar: turno 2, mismo equipo, mismo operador.
    expect((await intercom('abrir')).body).toMatchObject({
      estado: 'abierta',
      transporte: 'equipo',
    });
    expect(equipo.estado()).toMatchObject({ aperturas: 2, sesionAbierta: true });

    // 4 · el equipo acepta la trama: la conversación vieja termina AHORA.
    const constancia = proximaConstancia();
    subida.soltar();
    expect(await constancia).toMatchObject({ operadorId: OP_1, dispositivoId: PORTERIA_A });

    // El turno 2 sigue siendo suyo, con el canal del equipo abierto…
    expect((await estado()).body).toMatchObject({ estado: 'abierta', transporte: 'equipo' });
    expect(equipo.estado()).toMatchObject({ cierres: 1, sesionAbierta: true });
    // …y la llamada nueva abre su audio.
    const nueva = await conectar();
    await nueva.escuchando;
    nueva.ws.close(1000);
    expect(await nueva.cerrado).toBe(1000);
  });
});
