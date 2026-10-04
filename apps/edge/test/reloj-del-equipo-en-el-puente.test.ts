import { afterEach, describe, expect, it, vi } from 'vitest';
import { Vigencia } from '@ncr/domain-core';
import {
  FuenteDePlacas,
  ProveedorRemoto,
  RelojDelEquipoDesviado,
  SesionDeTunel,
  equiposSimulados,
  jpegConMedidas,
  personasPor,
} from '@ncr/providers';
import type { Enlace } from '@ncr/providers';
import { componerPuente } from '../src/composicion-puente';
import { cargarConfiguracionDelPuente } from '../src/configuracion/esquema-del-puente';
import { cargarConfiguracionDeSitio } from '../src/configuracion/esquema-de-sitio';
import { equipoEnSitio } from '../src/diagnostico-de-equipo';
import type { SocketWeb } from '../src/infraestructura/tunel/enlace-websocket';
import { COP, PLANTILLA, TERMINAL, entornoDeSitio } from './banco-de-sitio';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * DT-15R-09 · CON PUENTE, EL ALTA POR EL EDGE MIRA EL RELOJ DEL EQUIPO
 *
 * El 29/09 el videoportero iba 13 h atrasado: reconocía la cara y negaba con
 * «permiso vencido». Desde la 15-N la API lee la hora del equipo antes de dar
 * de alta a alguien con vigencia; desde la 15-Q2 esa alta la ejecuta el Edge, y
 * su proveedor se componía sin el umbral: no miraba. Aquí va el camino entero
 * de un sitio con puente —la orden sale de la nube por el túnel, el Edge la
 * cumple con SU `.env` contra la terminal simulada— y lo que vuelve a la nube
 * es el error TIPADO, sin una sola escritura en el equipo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const AHORA = new Date('2026-10-03T13:00:00.000Z'); // 08:00 en Bogotá
const USUARIO = 'servicio';
const CLAVE = 'clave-simulada';
const vigencia = (): Vigencia => {
  const r = Vigencia.crear(AHORA, new Date('2026-10-03T19:00:00.000Z'));
  if (!r.ok) throw new Error('vigencia de prueba');
  return r.valor;
};

/**
 * El WebSocket que el Edge abre hacia la API, sin red: contesta `bienvenida` al
 * `hola` (la identidad del Edge no es lo que se prueba aquí) y desde ahí es la
 * punta de la NUBE del túnel, una `SesionDeTunel` par como la de la API.
 */
class SocketHaciaLaNube implements SocketWeb {
  binaryType = '';
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((evento: { readonly data: unknown }) => void) | null = null;
  onclose: ((evento: { readonly code: number; readonly reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  nube: SesionDeTunel | null = null;
  private readonly receptores: ((dato: string | Uint8Array) => void)[] = [];
  private readonly cierres: ((motivo: string) => void)[] = [];

  constructor() {
    setImmediate(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }

  send(dato: string | Uint8Array): void {
    if (this.nube === null) {
      this.nube = new SesionDeTunel(this.enlace(), { paridad: 'par' });
      this.alEdge(JSON.stringify({ v: 1, t: 'bienvenida', copropiedadId: COP }));
      return;
    }
    const copia = typeof dato === 'string' ? dato : new Uint8Array(dato);
    setImmediate(() => this.receptores.forEach((r) => r(copia)));
  }

  close(codigo = 1000, motivo = 'cerrado'): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    setImmediate(() => {
      this.cierres.forEach((c) => c(motivo));
      this.onclose?.({ code: codigo, reason: motivo });
    });
  }

  private alEdge(dato: string | Uint8Array): void {
    setImmediate(() => this.onmessage?.({ data: dato }));
  }

  private enlace(): Enlace {
    return {
      enviar: (dato) => this.alEdge(typeof dato === 'string' ? dato : new Uint8Array(dato)),
      cerrar: (codigo, motivo) => this.close(codigo, motivo),
      alRecibir: (m) => void this.receptores.push(m),
      alCerrar: (m) => void this.cierres.push(m),
    };
  }
}

let n = 0;
const cerrar: (() => void)[] = [];
afterEach(() => cerrar.splice(0).forEach((c) => c()));

/** La terminal del conjunto, con su reloj, y lo que se le pidió. */
const terminal = (hora: string) => {
  n += 1;
  const host = `terminal-${String(n)}.puente.simulado.invalid`;
  const simulado = equiposSimulados({
    [host]: { familia: 'terminal', usuario: USUARIO, clave: CLAVE, hora },
  });
  const pedidas: string[] = [];
  const peticion = (async (entrada: string | URL, init?: RequestInit) => {
    pedidas.push(`${init?.method ?? 'GET'} ${new URL(String(entrada)).pathname}`);
    return simulado(entrada, init);
  }) as typeof fetch;
  const equipo = { dispositivoId: TERMINAL, tipo: 'terminal_facial', host, puerto: 80 };
  return { host, pedidas, peticion, equipo: { ...equipo, usuario: USUARIO, clave: CLAVE } };
};

/** Un sitio con puente: el Edge de verdad, con su `.env`, y la nube al otro lado del túnel. */
const sitioConPuente = async (hora: string, entorno: Record<string, string> = {}) => {
  const t = terminal(hora);
  const socket = new SocketHaciaLaNube();
  const config = cargarConfiguracionDelPuente(
    entornoDeSitio({
      EDGE_TUNEL: 'activo',
      EDGE_EQUIPOS_LLAVE: Buffer.alloc(32, 7).toString('base64'),
      EDGE_EQUIPOS: JSON.stringify([{ ...t.equipo, numeroDePuerta: 1 }]),
      ...entorno,
    }),
  );
  const { edge, tunel } = componerPuente(config, {
    registrar: () => undefined,
    reloj: { ahora: () => AHORA },
    peticionAEquipos: t.peticion,
    tunel: { abrirSocket: () => socket },
  });
  tunel?.iniciar();
  cerrar.push(() => {
    tunel?.detener();
    edge.db.close();
  });
  await vi.waitFor(() => expect(tunel?.sesion() ?? null).not.toBeNull(), { timeout: 5_000 });
  const nube = new ProveedorRemoto({ sesion: () => socket.nube, fuente: new FuenteDePlacas() });
  const escrito = () => t.pedidas.filter((p) => !p.startsWith('GET '));
  return { nube, escrito, personas: () => personasPor.get(t.host)?.size ?? 0 };
};

describe('DT-15R-09 · el alta de un rostro por el Edge puente, con el reloj del equipo', () => {
  it('13 h atrasado: la nube recibe RelojDelEquipoDesviado y en la terminal no se escribe NADA', async () => {
    const sitio = await sitioConPuente('2026-10-02T19:00:00-05:00');
    const alta = sitio.nube.sincronizar(TERMINAL, PLANTILLA, jpegConMedidas(), vigencia());
    await expect(alta).rejects.toBeInstanceOf(RelojDelEquipoDesviado);
    await expect(alta).rejects.toThrow(/el reloj del equipo va 13 h 0 min atrasado/);
    await expect(alta).rejects.toMatchObject({ dispositivoId: TERMINAL, desvioSegundos: -46_800 });
    expect(sitio.escrito()).toEqual([]);
    expect(sitio.personas()).toBe(0);
  });

  it('en hora (10 s): el alta sigue su camino y la persona queda en la terminal', async () => {
    const sitio = await sitioConPuente('2026-10-03T08:00:10-05:00');
    await sitio.nube.sincronizar(TERMINAL, PLANTILLA, jpegConMedidas(), vigencia());
    expect(sitio.escrito().some((p) => p.includes('/UserInfo/'))).toBe(true);
    expect(sitio.personas()).toBe(1);
  });

  it('el umbral es EQUIPOS_DESVIO_DE_RELOJ_S del Edge: 45 s se rechaza con 30 y pasa con 60', async () => {
    const adelantado = '2026-10-03T08:00:45-05:00';
    const con30 = await sitioConPuente(adelantado);
    await expect(
      con30.nube.sincronizar(TERMINAL, PLANTILLA, jpegConMedidas(), vigencia()),
    ).rejects.toThrow(/45 s adelantado/);
    expect(con30.personas()).toBe(0);

    const con60 = await sitioConPuente(adelantado, { EQUIPOS_DESVIO_DE_RELOJ_S: '60' });
    await con60.nube.sincronizar(TERMINAL, PLANTILLA, jpegConMedidas(), vigencia());
    expect(con60.personas()).toBe(1);
  });
});

describe('DT-15R-09 · `pnpm sitio:edge` juzga la hora con el MISMO umbral que frena el alta', () => {
  const juzgar = async (entorno: Record<string, string>) => {
    const t = terminal('2026-10-03T08:00:45-05:00');
    const config = cargarConfiguracionDeSitio(entornoDeSitio(entorno));
    return equipoEnSitio(
      { ...t.equipo, tipo: 'terminal_facial', protocolo: 'http' },
      config,
      t.peticion,
      () => AHORA,
    );
  };

  it('45 s desviado: AVISO con el umbral por omisión (30 s); antes, con 60 s fijos, salía OK', async () => {
    expect(await juzgar({})).toMatchObject({ estado: 'AVISO' });
    expect((await juzgar({})).detalle).toContain('reloj desviado');
  });

  it('con EQUIPOS_DESVIO_DE_RELOJ_S=60 el mismo equipo está en hora', async () => {
    expect(await juzgar({ EQUIPOS_DESVIO_DE_RELOJ_S: '60' })).toMatchObject({ estado: 'OK' });
  });
});
