import { describe, expect, it } from 'vitest';
import { DatabaseSync } from '../src/infraestructura/sqlite/motor';
import { ESQUEMA } from '../src/infraestructura/sqlite/esquema';
import { BandejaSqlite } from '../src/infraestructura/sqlite/bandeja-sqlite';
import {
  CuarentenaSqlite,
  cuarentenaConConstancia,
} from '../src/infraestructura/sqlite/cuarentena-sqlite';
import { Reconciliacion } from '../src/aplicacion/reconciliacion';
import type { ClienteDeNube, EnvioPendiente, ResultadoDeEnvio } from '../src/aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · E6 · P-31 · UNA PLACA ILEGIBLE DURANTE UN CORTE NO BLOQUEA LA BANDEJA
 *
 * Sin WAN, el Edge resuelve tres accesos; el del medio trae una placa que la
 * nube no acepta. Vuelve la WAN: la nube lo rechaza —con la clave VACÍA, como
 * hace la real cuando no puede construirla— y el Edge conserva el MOTIVO por la
 * posición. Tras `RECONCILIACION_INTENTOS` rechazos pasa a la cuarentena
 * (SQLite real, con su cuerpo y su motivo), queda constancia en el registro, y
 * el tercero llega a la nube. Nada se descarta en silencio (RN-02).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const INTENTOS = 8;
const T0 = new Date('2026-10-03T12:00:00.000Z');

class NubeQueRechazaLoIlegible implements ClienteDeNube {
  caida = true;
  readonly creados: string[] = [];
  rechazos = 0;

  async reconciliar(lote: readonly EnvioPendiente[]): Promise<readonly ResultadoDeEnvio[]> {
    if (this.caida) throw new Error('sin conexión');
    const resultados: ResultadoDeEnvio[] = [];
    for (const envio of lote) {
      const { placaLeida } = JSON.parse(envio.cuerpo) as { placaLeida?: string };
      if (placaLeida !== undefined && !/^[A-Z0-9]{5,8}$/.test(placaLeida)) {
        this.rechazos += 1;
        // Como la API: sin clave (no pudo construirla) y se corta en el primero.
        resultados.push({
          claveIdempotencia: '',
          aceptado: false,
          duplicado: false,
          detalle: 'placa ilegible: no es una placa',
        });
        break;
      }
      this.creados.push(envio.claveIdempotencia);
      resultados.push({
        claveIdempotencia: envio.claveIdempotencia,
        aceptado: true,
        duplicado: false,
      });
    }
    return resultados;
  }

  async descargarReglas(): Promise<null> {
    return null;
  }
}

describe('E6 · cuarentena tras los intentos, sin perder nada', () => {
  it('sin WAN: tres accesos; con WAN: el ilegible a cuarentena y los otros dos a la nube', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(ESQUEMA);
    const bandeja = new BandejaSqlite(db);
    const registro: { mensaje: string; contexto: unknown }[] = [];
    const nube = new NubeQueRechazaLoIlegible();
    const reconciliacion = new Reconciliacion(bandeja, nube, {
      lote: 10,
      intentosMaximos: INTENTOS,
      backoffBaseMs: 1_000,
      aleatorio: () => 1,
      cuarentena: cuarentenaConConstancia(db, (_n, mensaje, contexto) =>
        registro.push({ mensaje, contexto }),
      ),
    });

    // Corte de WAN: el Edge decide y encola.
    bandeja.encolar('k1', JSON.stringify({ placaLeida: 'ABC123' }), T0);
    bandeja.encolar('k2', JSON.stringify({ placaLeida: '¿?·¿' }), T0);
    bandeja.encolar('k3', JSON.stringify({ placaLeida: 'XYZ789' }), T0);
    let ahora = T0;
    expect((await reconciliacion.ejecutar(ahora)).fallidos).toBe(1); // sin WAN: transporte
    expect(new CuarentenaSqlite(db).listar()).toHaveLength(0);

    // Vuelve la WAN. Se reconcilia como el gateway: un tic tras otro.
    nube.caida = false;
    for (let tic = 0; tic < 60 && bandeja.cuantosPendientes() > 0; tic += 1) {
      ahora = new Date(ahora.getTime() + 6 * 60_000); // más que el retroceso máximo
      await reconciliacion.ejecutar(ahora);
    }

    expect(nube.creados).toEqual(['k1', 'k3']);
    expect(nube.rechazos).toBe(INTENTOS);
    expect(bandeja.cuantosPendientes()).toBe(0);
    const [apartado, ...otros] = new CuarentenaSqlite(db).listar();
    expect(otros).toHaveLength(0);
    expect(apartado).toMatchObject({
      claveIdempotencia: 'k2',
      motivo: 'placa ilegible: no es una placa',
      cuerpo: JSON.stringify({ placaLeida: '¿?·¿' }),
    });
    expect(registro).toEqual([
      expect.objectContaining({
        mensaje: expect.stringMatching(/cuarentena/),
        contexto: expect.objectContaining({ claveIdempotencia: 'k2' }),
      }),
    ]);
  });

  it('un corte LARGO no manda nada a cuarentena: el transporte no es un rechazo', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(ESQUEMA);
    const bandeja = new BandejaSqlite(db);
    const reconciliacion = new Reconciliacion(bandeja, new NubeQueRechazaLoIlegible(), {
      lote: 10,
      intentosMaximos: INTENTOS,
      backoffBaseMs: 1_000,
      aleatorio: () => 1,
      cuarentena: new CuarentenaSqlite(db),
    });
    bandeja.encolar('k1', JSON.stringify({ placaLeida: 'ABC123' }), T0);
    for (let tic = 0; tic < 3 * INTENTOS; tic += 1) {
      await reconciliacion.ejecutar(new Date(T0.getTime() + tic * 6 * 60_000));
    }
    expect(bandeja.cuantosPendientes()).toBe(1);
    expect(new CuarentenaSqlite(db).listar()).toHaveLength(0);
  });
});
