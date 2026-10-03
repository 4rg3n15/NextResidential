import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leerMensaje } from '@ncr/providers';
import type { SesionDeTunel } from '@ncr/providers';
import { ClienteDeTunel, retrasoDeReconexion, urlDelTunel } from './cliente-de-tunel';
import type { SocketWeb } from './enlace-websocket';

/**
 * 15-Q2 · A1 · el túnel desde el Edge: `hola` firmado al abrir, sesión sólo
 * con la `bienvenida` de SU copropiedad, y reconexión con backoff exponencial y
 * jitter completo (§2.7.5) — el máximo si la nube rechazó la identidad.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const OTRA_COP = '10000000-0000-4000-8000-000000000002';
const EDGE = 'ed000000-0000-4000-8000-0000000000e1';
const CREDENCIAL = 'credencial-del-gateway-para-pruebas-sin-valor';
const AHORA_MS = Date.parse('2026-10-01T10:00:00.000Z');
const IDENTIDAD = { urlApi: 'https://api.nube.invalid', edgeId: EDGE, copropiedadId: COP };

class SocketFalso implements SocketWeb {
  binaryType = '';
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((evento: { readonly data: unknown }) => void) | null = null;
  onclose: ((evento: { readonly code: number; readonly reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly enviados: (string | Uint8Array)[] = [];
  readonly cierres: { codigo: number | undefined; motivo: string | undefined }[] = [];

  send(dato: string | Uint8Array): void {
    this.enviados.push(dato);
  }
  close(codigo?: number, motivo?: string): void {
    this.cierres.push({ codigo, motivo });
  }
  abrir(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  llega(data: unknown): void {
    this.onmessage?.({ data });
  }
  cerrarDesdeLaNube(code: number, reason = ''): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

const bienvenida = (copropiedadId = COP) =>
  JSON.stringify({ v: 1, t: 'bienvenida', copropiedadId });

/** Un cliente ya iniciado, con sockets, esperas y reloj de mentira. */
const montar = (sinReloj = false) => {
  const sockets: SocketFalso[] = [];
  const urls: string[] = [];
  const esperas: { ms: number; hacer: () => void }[] = [];
  const sesiones: SesionDeTunel[] = [];
  const registros: { nivel: string; mensaje: string; contexto: unknown }[] = [];
  const cliente = new ClienteDeTunel({
    ...IDENTIDAD,
    credencial: CREDENCIAL,
    alAbrir: (s) => void sesiones.push(s),
    registrar: (nivel, mensaje, contexto) => void registros.push({ nivel, mensaje, contexto }),
    abrirSocket: (url) => {
      urls.push(url);
      const s = new SocketFalso();
      sockets.push(s);
      return s;
    },
    ...(sinReloj ? {} : { ahora: () => AHORA_MS }),
    azar: () => 0.5,
    esperar: (ms, hacer) => void esperas.push({ ms, hacer }),
    backoffBaseMs: 1_000,
    backoffMaximoMs: 30_000,
  });
  cliente.iniciar();
  const ultimo = (): SocketFalso => {
    const s = sockets.at(-1);
    if (s === undefined) throw new Error('no se abrió ningún socket');
    return s;
  };
  /** Ejecuta la espera pendiente más reciente: el siguiente intento. */
  const reintentar = (): void => esperas.at(-1)?.hacer();
  return { cliente, sockets, urls, esperas, sesiones, registros, ultimo, reintentar };
};

afterEach(() => void vi.useRealTimers());

describe('ClienteDeTunel · el apretón de manos', () => {
  it('al abrir manda `hola` con su identidad y la firma HMAC de su credencial', () => {
    const m = montar();
    expect(m.urls).toEqual(['wss://api.nube.invalid/edge/tunel']);
    m.ultimo().abrir();
    const crudo = m.ultimo().enviados[0];
    // Es un `hola` que el protocolo acepta tal cual: la API lo leerá igual.
    const hola = leerMensaje(String(crudo));
    if (hola.t !== 'hola') throw new Error('se esperaba hola');
    expect(hola).toMatchObject({ edgeId: EDGE, copropiedadId: COP });
    expect(hola.marca).toBe(String(Math.floor(AHORA_MS / 1000)));
    expect(hola.nonce).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const firmado = `${hola.marca}.GET /edge/tunel\n${hola.nonce}`;
    expect(hola.firma).toBe(createHmac('sha256', CREDENCIAL).update(firmado).digest('hex'));
    // La credencial no viaja: sólo su firma.
    expect(String(crudo)).not.toContain(CREDENCIAL);
  });

  it('la bienvenida de SU copropiedad abre la sesión y avisa a quien la instala', () => {
    const m = montar();
    expect(m.cliente.sesion()).toBeNull();
    m.ultimo().abrir();
    m.ultimo().llega(bienvenida());
    expect(m.sesiones).toHaveLength(1);
    expect(m.cliente.sesion()).toBe(m.sesiones[0]);
    expect(m.sesiones[0]?.estaAbierta).toBe(true);
    expect(m.registros.map((r) => `${r.nivel}: ${r.mensaje}`)).toContain(
      'info: túnel con la nube abierto',
    );
    // Lo que llega después es de la sesión, no del apretón de manos.
    m.ultimo().llega(JSON.stringify({ v: 1, t: 'latido' }));
    expect(m.ultimo().cierres).toEqual([]);
    m.cliente.detener();
  });

  it.each([
    ['la bienvenida de OTRA copropiedad', bienvenida(OTRA_COP)],
    ['algo que no es JSON', 'no es un mensaje'],
    ['otro tipo de mensaje', JSON.stringify({ v: 1, t: 'latido' })],
    ['una trama binaria', new Uint8Array([1, 0, 0, 0, 1])],
  ])('%s cierra con 1008 y no abre sesión', (_caso, dato) => {
    const m = montar();
    m.ultimo().abrir();
    m.ultimo().llega(dato);
    expect(m.ultimo().cierres).toEqual([
      { codigo: 1008, motivo: 'se esperaba bienvenida de su copropiedad' },
    ]);
    expect(m.sesiones).toEqual([]);
    expect(m.cliente.sesion()).toBeNull();
    m.ultimo().cerrarDesdeLaNube(1008);
    expect(m.esperas).toHaveLength(1);
  });

  it('sin bienvenida en 10 s cierra con 4408; con ella a tiempo, el plazo no dispara', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const m = montar();
    m.ultimo().abrir();
    vi.advanceTimersByTime(9_999);
    expect(m.ultimo().cierres).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(m.ultimo().cierres).toEqual([{ codigo: 4408, motivo: 'sin bienvenida' }]);

    const n = montar();
    n.ultimo().abrir();
    n.ultimo().llega(bienvenida());
    vi.advanceTimersByTime(20_000);
    expect(n.ultimo().cierres).toEqual([]);
    n.cliente.detener();
  });
});

describe('ClienteDeTunel · reconexión', () => {
  it.each([4401, 4403, 4404])('un rechazo de identidad (%i) espera el máximo', (codigo) => {
    const m = montar();
    m.ultimo().abrir();
    m.ultimo().cerrarDesdeLaNube(codigo, 'Edge no acreditado');
    expect(m.esperas.map((e) => e.ms)).toEqual([30_000]);
    expect(m.registros.at(-1)).toEqual({
      nivel: 'aviso',
      mensaje: 'túnel con la nube cerrado; se reintenta',
      contexto: { codigo, motivo: 'Edge no acreditado', espera: 30_000 },
    });
  });

  it('otros cierres: exponencial con jitter completo, acotado al máximo', () => {
    const m = montar();
    for (let i = 0; i < 7; i += 1) {
      m.ultimo().cerrarDesdeLaNube(1006);
      m.reintentar();
    }
    // azar = 0.5 → la mitad de base·2^n, sin pasar de la mitad del máximo.
    expect(m.esperas.map((e) => e.ms)).toEqual([500, 1_000, 2_000, 4_000, 8_000, 15_000, 15_000]);
    expect(m.sockets).toHaveLength(8);
  });

  it('una sesión que se abrió pone el contador a cero: su caída reintenta desde la base', () => {
    const m = montar();
    m.ultimo().cerrarDesdeLaNube(1006);
    m.reintentar();
    m.ultimo().cerrarDesdeLaNube(1006);
    m.reintentar();
    m.ultimo().abrir();
    m.ultimo().llega(bienvenida());
    m.ultimo().cerrarDesdeLaNube(1001, 'la API se reinicia');
    expect(m.esperas.map((e) => e.ms)).toEqual([500, 1_000, 500]);
    expect(m.cliente.sesion()).toBeNull();
  });

  it('un mensaje fuera de protocolo dentro de la sesión la cierra (1008) y se registra', () => {
    const m = montar();
    m.ultimo().abrir();
    m.ultimo().llega(bienvenida());
    m.ultimo().llega('{roto');
    expect(m.ultimo().cierres).toEqual([{ codigo: 1008, motivo: 'mensaje fuera de protocolo' }]);
    expect(m.registros.map((r) => r.mensaje)).toContain(
      'mensaje del túnel fuera de protocolo: se cierra',
    );
    expect(m.cliente.sesion()).toBeNull();
    expect(m.esperas).toHaveLength(1);
  });

  it('sin esperar, azar ni backoff inyectados: temporizador real, 60 s de máximo y jitter real', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const sockets: SocketFalso[] = [];
    const cliente = new ClienteDeTunel({
      ...IDENTIDAD,
      credencial: CREDENCIAL,
      alAbrir: () => undefined,
      abrirSocket: () => {
        const s = new SocketFalso();
        sockets.push(s);
        return s;
      },
    });
    cliente.iniciar();
    sockets[0]?.abrir();
    sockets[0]?.cerrarDesdeLaNube(4401);
    vi.advanceTimersByTime(59_999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    sockets[1]?.abrir();
    sockets[1]?.cerrarDesdeLaNube(1006);
    vi.advanceTimersByTime(2_000); // segundo intento: jitter en [0, 2·base)
    expect(sockets).toHaveLength(3);
    // Cada `hola` lleva un nonce nuevo: uno de un solo uso por intento.
    const nonce = (s?: SocketFalso) =>
      (JSON.parse(String(s?.enviados[0])) as { nonce: string }).nonce;
    expect(nonce(sockets[0])).not.toBe(nonce(sockets[1]));
    cliente.detener();
  });
});

describe('ClienteDeTunel · detener', () => {
  it('con sesión abierta: la cierra con 1000 y NO reintenta', () => {
    const m = montar();
    m.ultimo().abrir();
    m.ultimo().llega(bienvenida());
    m.cliente.detener();
    expect(m.ultimo().cierres).toEqual([{ codigo: 1000, motivo: 'el Edge se detiene' }]);
    expect(m.cliente.sesion()).toBeNull();
    expect(m.esperas).toEqual([]);
  });

  it('sin sesión: un cierre posterior del socket no programa otro intento', () => {
    const m = montar();
    m.cliente.detener();
    m.ultimo().cerrarDesdeLaNube(1006);
    expect(m.esperas).toEqual([]);
  });

  it('detener durante la espera cancela el intento ya programado', () => {
    const m = montar();
    m.ultimo().cerrarDesdeLaNube(1006);
    m.cliente.detener();
    m.reintentar();
    expect(m.sockets).toHaveLength(1);
  });

  it('detener durante el apretón de manos: la bienvenida que llega tarde no abre sesión', () => {
    const m = montar(true); // y sin reloj inyectado: la sesión usa el del sistema
    m.ultimo().abrir();
    m.cliente.detener();
    m.ultimo().llega(bienvenida());
    expect(m.sesiones).toHaveLength(0);
    expect(m.cliente.sesion()).toBeNull();
  });
});

describe('urlDelTunel y retrasoDeReconexion', () => {
  it.each([
    ['http://127.0.0.1:3000', 'ws://127.0.0.1:3000/edge/tunel'],
    ['https://api.nube.invalid', 'wss://api.nube.invalid/edge/tunel'],
    ['https://api.nube.invalid/v1/', 'wss://api.nube.invalid/edge/tunel'],
  ])('%s → %s', (api, ws) => {
    expect(urlDelTunel(api)).toBe(ws);
  });

  it('jitter completo: entre 0 y min(máximo, base·2^n)', () => {
    expect(retrasoDeReconexion(0, 1_000, 60_000, () => 0)).toBe(0);
    expect(retrasoDeReconexion(3, 1_000, 60_000, () => 0.999_999)).toBe(7_999);
    expect(retrasoDeReconexion(10, 1_000, 60_000, () => 0.999_999)).toBe(59_999);
    expect(retrasoDeReconexion(10, 1_000, 60_000, () => 0.25)).toBe(15_000);
  });

  it('el exponente se acota en 20: un contador enorme no desborda', () => {
    expect(retrasoDeReconexion(1_000, 1, Number.MAX_SAFE_INTEGER, () => 1)).toBe(2 ** 20);
    expect(Number.isFinite(retrasoDeReconexion(10_000, 1_000, 60_000, () => 0.5))).toBe(true);
  });
});
