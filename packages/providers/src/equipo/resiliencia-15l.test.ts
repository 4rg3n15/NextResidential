import { describe, expect, it } from 'vitest';
import { ClienteDeEquipo, VENTANA_DE_CREDENCIAL_RECHAZADA_MS } from './cliente';
import { EscuchaDeAlertStream } from './escucha-alertstream';
import { rutaPara } from './catalogo-de-rutas';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import { conReintentos } from '../nucleo/reintentos';
import {
  CredencialRechazada,
  EquipoAveriado,
  EquipoOcupado,
  DesafioVencido,
} from '../nucleo/errores';
import { EquipoInalcanzable } from './cliente';

/**
 * A5 (ETAPA 15-L) · resiliencia en la red de sitio.
 *
 *  · una credencial rechazada NO se vuelve a presentar: ni orden, ni escucha,
 *    ni sondeo, hasta que cambie o pase la ventana — el equipo bloquea la IP;
 *  · se reintenta con espera creciente y dispersión sólo lo reintentable.
 */
const HOST = '203.0.113.60';
const IDENTIDAD = rutaPara('leer la identidad del equipo (modelo, firmware, serie)', 'comun');

/** El simulado, contando cuántas peticiones le LLEGAN de verdad. */
const contado = (guion: Parameters<typeof equipoSimulado>[0]) => {
  const simulado = equipoSimulado(guion);
  const cuenta = { peticiones: 0 };
  const peticion = (async (entrada: string | URL, opciones?: RequestInit) => {
    cuenta.peticiones += 1;
    return simulado(entrada, opciones);
  }) as typeof fetch;
  return { peticion, cuenta };
};

describe('A5 · una credencial rechazada no se vuelve a presentar', () => {
  const guion = {
    familia: 'terminal',
    usuario: 'servicio',
    clave: 'clave-buena',
    rechazaCredencial: true,
  } as const;

  it('la segunda petición no sale a la red y dice por qué', async () => {
    const { peticion, cuenta } = contado(guion);
    let t = 1_000_000;
    const cliente = new ClienteDeEquipo({
      host: HOST,
      usuario: 'servicio',
      clave: 'clave-mala',
      peticion,
      ahora: () => t,
      dispositivoId: 'terminal-1',
    });
    const primera = await cliente.pedir(IDENTIDAD.metodo, IDENTIDAD.ruta);
    expect(primera.estado).toBe(401);
    const presentadas = cuenta.peticiones;

    t += 60_000;
    const segunda = cliente.pedir(IDENTIDAD.metodo, IDENTIDAD.ruta);
    await expect(segunda).rejects.toBeInstanceOf(CredencialRechazada);
    await expect(segunda).rejects.toThrow(/hace 1 min: no se vuelve a presentar/);
    expect(cuenta.peticiones).toBe(presentadas);

    // Otro cliente del MISMO equipo y la misma clave (la escucha, el sondeo):
    // comparte la marca, tampoco sale.
    const otro = new ClienteDeEquipo({
      host: HOST,
      usuario: 'servicio',
      clave: 'clave-mala',
      peticion,
      ahora: () => t,
    });
    await expect(otro.pedir(IDENTIDAD.metodo, IDENTIDAD.ruta)).rejects.toBeInstanceOf(
      CredencialRechazada,
    );
    expect(cuenta.peticiones).toBe(presentadas);
  });

  it('con la credencial corregida en la consola, se vuelve a presentar', async () => {
    const { peticion, cuenta } = contado({ ...guion, rechazaCredencial: false });
    const conClave = (clave: string) =>
      new ClienteDeEquipo({ host: HOST, usuario: 'servicio', clave, peticion });
    expect((await conClave('clave-mala').pedir(IDENTIDAD.metodo, IDENTIDAD.ruta)).estado).toBe(401);
    const antes = cuenta.peticiones;
    const r = await conClave('clave-buena').pedir(IDENTIDAD.metodo, IDENTIDAD.ruta);
    expect(r.ok).toBe(true);
    expect(cuenta.peticiones).toBeGreaterThan(antes);
  });

  it('pasada la ventana, se prueba UNA vez más (el equipo ya desbloqueó)', async () => {
    const { peticion, cuenta } = contado(guion);
    let t = 5_000_000;
    const cliente = new ClienteDeEquipo({
      host: HOST,
      usuario: 'servicio',
      clave: 'clave-mala',
      peticion,
      ahora: () => t,
    });
    await cliente.pedir(IDENTIDAD.metodo, IDENTIDAD.ruta);
    const presentadas = cuenta.peticiones;
    t += VENTANA_DE_CREDENCIAL_RECHAZADA_MS + 1;
    expect((await cliente.pedir(IDENTIDAD.metodo, IDENTIDAD.ruta)).estado).toBe(401);
    expect(cuenta.peticiones).toBeGreaterThan(presentadas);
  });

  it('la escucha se DETIENE ante la credencial rechazada: no reconecta en bucle', async () => {
    const { peticion, cuenta } = contado({ ...guion, familia: 'terminal' });
    const esperas: number[] = [];
    const control = new AbortController();
    const escucha = new EscuchaDeAlertStream({
      host: HOST,
      usuario: 'servicio',
      clave: 'clave-mala',
      peticion,
      dispositivoId: 'terminal-1',
      familia: 'terminal',
      // Sin la corrección esto no termina: reconecta con espera creciente. Se
      // corta a la tercera espera para que la prueba falle en vez de colgarse.
      esperar: async (ms) => {
        esperas.push(ms);
        if (esperas.length >= 3) control.abort();
      },
    });
    const recibidos: unknown[] = [];
    for await (const evento of escucha.escuchar(control.signal)) recibidos.push(evento);
    expect(recibidos).toEqual([]);
    expect(control.signal.aborted).toBe(false);
    expect(esperas).toEqual([]);
    expect(cuenta.peticiones).toBeLessThanOrEqual(2);
  });
});

describe('A5 · reintento con espera creciente y dispersión, sólo de lo reintentable', () => {
  const medio = () => {
    const esperas: number[] = [];
    return {
      esperas,
      medio: {
        esperar: async (ms: number) => {
          esperas.push(ms);
        },
        azar: () => 0.5,
      },
    };
  };

  it('ocupado dos veces y luego acepta: tres intentos, esperas crecientes y dispersas', async () => {
    const { esperas, medio: m } = medio();
    let intentos = 0;
    const r = await conReintentos(
      async () => {
        intentos += 1;
        if (intentos < 3) throw new EquipoOcupado('t', 'ocupado');
        return 'abierta';
      },
      undefined,
      m,
    );
    expect(r).toBe('abierta');
    expect(esperas).toEqual([100, 200]);
  });

  it('el nonce vencido también se reintenta; tras tres intentos, se rinde', async () => {
    const { esperas, medio: m } = medio();
    await expect(
      conReintentos(
        async () => {
          throw new DesafioVencido('t');
        },
        undefined,
        m,
      ),
    ).rejects.toBeInstanceOf(DesafioVencido);
    expect(esperas).toHaveLength(2);
  });

  it.each([
    ['credencial rechazada', () => new CredencialRechazada('t')],
    ['equipo inalcanzable (la orden pudo ejecutarse)', () => new EquipoInalcanzable('mudo', 5000)],
    ['avería del equipo', () => new EquipoAveriado('t', 'x')],
  ])('%s: NO se reintenta', async (_nombre, error) => {
    const { esperas, medio: m } = medio();
    let intentos = 0;
    await expect(
      conReintentos(
        async () => {
          intentos += 1;
          throw error();
        },
        undefined,
        m,
      ),
    ).rejects.toBeDefined();
    expect(intentos).toBe(1);
    expect(esperas).toEqual([]);
  });
});
