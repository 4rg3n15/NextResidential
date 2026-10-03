import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
// `utilidades` PRIMERO: carga `AppModule` en su orden (ciclo eventos ↔ autorizaciones).
import { COP_A, COP_B, crearApp, crearFirmante, direccionDe, tokenDe } from './utilidades';
import type { Firmante, Identidad } from './utilidades';
import { BilletesDeUnSoloUso } from '../src/comun/billetes-de-un-solo-uso';
import { abrirFlujoSse } from '../src/eventos/presentacion/escritor-sse';
import { CanalEnProceso } from '../src/eventos/infraestructura/canal-en-proceso';
import { VIDA_DEL_FLUJO_DIRECTO_MS } from '../src/eventos/presentacion/flujo-directo.controller';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · D1 · EL FLUJO EN VIVO DIRECTO A LA API, CON BILLETE DE UN SOLO USO
 *
 * La consola en Netlify (P-20) abre el SSE contra la API: el billete sale de
 * una ruta normal (sesión, rol, copropiedad), vale UNA vez, 15 s, desde la IP
 * que lo pidió y para el flujo de eventos; el flujo directo dura como mucho
 * lo que un token. IPs de documentación (RFC 5737), por `X-Forwarded-For`
 * desde el bucle local, que es el proxy de confianza por omisión.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const IP_DEL_OPERADOR = '198.51.100.20';
const OTRA_IP = '198.51.100.21';
let app: INestApplication;
let firmante: Firmante;
let base = '';

const como = (identidad: Identidad) => tokenDe(firmante, identidad);

const pedirBillete = async (identidad: Identidad, cop = COP_A, ip = IP_DEL_OPERADOR) =>
  request(app.getHttpServer())
    .post(`/copropiedades/${cop}/eventos/billete`)
    .set('Authorization', `Bearer ${await como(identidad)}`)
    .set('X-Forwarded-For', ip);

const esperar = async (pendiente: Promise<request.Response>, estado: number) => {
  const r = await pendiente;
  expect(r.status, JSON.stringify(r.body)).toBe(estado);
  return r;
};

/** Abre el flujo directo y devuelve el estado y el primer bloque, o el cuerpo de error. */
const abrirDirecto = async (billete: string, ip = IP_DEL_OPERADOR) => {
  const control = new AbortController();
  const r = await fetch(`${base}/flujo-directo/eventos?billete=${encodeURIComponent(billete)}`, {
    headers: { Accept: 'text/event-stream', 'X-Forwarded-For': ip },
    signal: control.signal,
  });
  const primero =
    r.status === 200 && r.body !== null
      ? new TextDecoder().decode((await r.body.getReader().read()).value)
      : await r.text();
  control.abort();
  return { estado: r.status, tipo: r.headers.get('content-type'), primero };
};

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  base = direccionDe(app);
});
afterAll(async () => {
  await app?.close();
});

describe('D1 · el billete sale de una ruta normal', () => {
  it('el portero de A obtiene un billete de propósito «eventos»', async () => {
    const r = await esperar(pedirBillete({ rol: 'portero', copropiedadId: COP_A }), 201);
    expect(r.body.billete).toMatch(/^eventos\.[A-Za-z0-9_-]{43}$/);
    expect(r.body.ruta).toBe('/flujo-directo/eventos');
  });

  it('el administrador de B no obtiene billete para A (404, aislamiento)', async () => {
    await esperar(pedirBillete({ rol: 'administrador', copropiedadId: COP_B }), 404);
  });

  it('el residente no tiene flujo de eventos: 403', async () => {
    await esperar(pedirBillete({ rol: 'residente', copropiedadId: COP_A }), 403);
  });

  it('sin sesión, 401', async () => {
    await request(app.getHttpServer()).post(`/copropiedades/${COP_A}/eventos/billete`).expect(401);
  });
});

describe('D1 · el billete abre el flujo UNA vez, desde su IP', () => {
  it('abre el mismo flujo que `…/eventos/flujo`, de SU copropiedad', async () => {
    const { body } = await esperar(pedirBillete({ rol: 'portero', copropiedadId: COP_A }), 201);
    const r = await abrirDirecto(body.billete);
    expect(r.estado).toBe(200);
    expect(r.tipo).toContain('text/event-stream');
    expect(r.primero).toContain(`event: listo\ndata: {"copropiedadId":"${COP_A}"}`);
  });

  it('el mismo billete otra vez: 401', async () => {
    const { body } = await esperar(pedirBillete({ rol: 'portero', copropiedadId: COP_A }), 201);
    expect((await abrirDirecto(body.billete)).estado).toBe(200);
    expect((await abrirDirecto(body.billete)).estado).toBe(401);
  });

  it('desde otra IP: 401, y el billete queda gastado', async () => {
    const { body } = await esperar(pedirBillete({ rol: 'portero', copropiedadId: COP_A }), 201);
    expect((await abrirDirecto(body.billete, OTRA_IP)).estado).toBe(401);
    expect((await abrirDirecto(body.billete)).estado).toBe(401);
  });

  it('inventado o mal formado: 401 o 400, nunca un flujo', async () => {
    expect((await abrirDirecto(`eventos.${'A'.repeat(43)}`)).estado).toBe(401);
    expect((await abrirDirecto('<script>')).estado).toBe(400);
  });
});

describe('D1 · reglas del billete y vida del flujo', () => {
  it('caduca a los 15 s y no vale para otro propósito', () => {
    let ahora = 0;
    const flujo = new BilletesDeUnSoloUso<{ ip: string }>('eventos', 15, () => ahora);
    const audio = new BilletesDeUnSoloUso<{ ip: string }>('audio', 15, () => ahora);
    const viejo = flujo.emitir({ ip: IP_DEL_OPERADOR }).billete;
    ahora = 15_001;
    expect(flujo.consumir(viejo, IP_DEL_OPERADOR)).toBeNull();
    const deAudio = audio.emitir({ ip: IP_DEL_OPERADOR }).billete;
    expect(flujo.consumir(deAudio, IP_DEL_OPERADOR)).toBeNull();
  });

  it('el flujo directo se cierra solo al cumplir la vida de un token', () => {
    vi.useFakeTimers();
    try {
      const canal = new CanalEnProceso({ registrar: () => undefined });
      const fin = vi.fn();
      const respuesta = {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: () => true,
        end: fin,
        on: () => undefined,
        writableEnded: false,
      };
      abrirFlujoSse(respuesta as never, canal, COP_A, VIDA_DEL_FLUJO_DIRECTO_MS);
      vi.advanceTimersByTime(VIDA_DEL_FLUJO_DIRECTO_MS - 1);
      expect(fin).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(fin).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
