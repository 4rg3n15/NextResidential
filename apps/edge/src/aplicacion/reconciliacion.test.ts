import { describe, expect, it } from 'vitest';
import { Reconciliacion, esperaDelIntento, seRindio } from './reconciliacion';
import type { BandejaDeSalida, ClienteDeNube, EnvioPendiente, ResultadoDeEnvio } from './puertos';

const AHORA = new Date('2026-09-21T10:00:00.000Z');

class BandejaFalsa implements BandejaDeSalida {
  filas: EnvioPendiente[] = [];
  readonly confirmadas: string[] = [];
  readonly fallidas: { clave: string; error: string; proximo: Date }[] = [];

  encolar(clave: string, cuerpo: string, encoladoEn: Date): void {
    if (this.filas.some((f) => f.claveIdempotencia === clave)) return;
    this.filas.push({
      claveIdempotencia: clave,
      secuencia: this.filas.length + 1,
      cuerpo,
      encoladoEn: encoladoEn.toISOString(),
      intentos: 0,
      proximoIntentoEn: null,
      ultimoError: null,
    });
  }
  pendientes(_ahora: Date, limite: number): readonly EnvioPendiente[] {
    return this.filas.slice(0, limite);
  }
  confirmar(clave: string): void {
    this.confirmadas.push(clave);
    this.filas = this.filas.filter((f) => f.claveIdempotencia !== clave);
  }
  fallo(clave: string, error: string, proximo: Date): void {
    this.fallidas.push({ clave, error, proximo });
    this.filas = this.filas.map((f) =>
      f.claveIdempotencia === clave ? { ...f, intentos: f.intentos + 1 } : f,
    );
  }
  cuantosPendientes(): number {
    return this.filas.length;
  }
  ultimaSecuenciaConfirmada(): number {
    return this.confirmadas.length;
  }
}

const nubeQueResponde = (fn: (lote: readonly EnvioPendiente[]) => ResultadoDeEnvio[]): ClienteDeNube => ({
  reconciliar: async (lote) => fn(lote),
  descargarReglas: async () => null,
});

const conTres = () => {
  const bandeja = new BandejaFalsa();
  for (const c of ['a', 'b', 'c']) bandeja.encolar(c, `{"k":"${c}"}`, AHORA);
  return bandeja;
};

const opciones = { lote: 10, intentosMaximos: 8, backoffBaseMs: 1000, aleatorio: () => 0.5 };

describe('reconciliación · CA-22', () => {
  it('EL DUPLICADO SALE DE LA BANDEJA IGUAL QUE EL CREADO', () => {
    // Es el corazón de CA-22. El Edge reenvía porque no sabe si llegó; la nube
    // dice «ya lo tenía». Tratarlo como fallo produciría un reintento infinito
    // de algo que ya está bien.
    const bandeja = conTres();
    const nube = nubeQueResponde((lote) =>
      lote.map((e) => ({
        claveIdempotencia: e.claveIdempotencia,
        aceptado: true,
        duplicado: e.claveIdempotencia === 'b',
      })),
    );
    return new Reconciliacion(bandeja, nube, opciones).ejecutar(AHORA).then((r) => {
      expect(r.creados).toBe(2);
      expect(r.duplicados).toBe(1);
      expect(bandeja.cuantosPendientes()).toBe(0);
      expect(bandeja.fallidas).toEqual([]);
    });
  });

  it('respeta el ORDEN de llegada', async () => {
    const bandeja = conTres();
    const vistos: string[] = [];
    const nube = nubeQueResponde((lote) => {
      vistos.push(...lote.map((e) => e.claveIdempotencia));
      return lote.map((e) => ({ claveIdempotencia: e.claveIdempotencia, aceptado: true, duplicado: false }));
    });
    await new Reconciliacion(bandeja, nube, opciones).ejecutar(AHORA);
    expect(vistos).toEqual(['a', 'b', 'c']);
  });

  it('UN FALLO CORTA EL LOTE, y eso no es desperdicio', async () => {
    // Si `b` falló por un corte, `c` va a fallar igual y gastaría otro tiempo
    // de espera. Y si `c` se confirmara, el histórico tendría `c` sin `b`.
    const bandeja = conTres();
    const nube = nubeQueResponde((lote) =>
      lote.map((e) => ({
        claveIdempotencia: e.claveIdempotencia,
        aceptado: e.claveIdempotencia !== 'b',
        duplicado: false,
        ...(e.claveIdempotencia === 'b' ? { detalle: 'la nube dijo que no' } : {}),
      })),
    );
    const r = await new Reconciliacion(bandeja, nube, opciones).ejecutar(AHORA);

    expect(r.creados).toBe(1);
    expect(r.fallidos).toBe(1);
    expect(bandeja.confirmadas).toEqual(['a']);
    expect(bandeja.fallidas.map((f) => f.clave)).toEqual(['b']);
    expect(bandeja.cuantosPendientes(), 'b y c siguen ahí').toBe(2);
  });

  it('una clave sin respuesta NO se confirma', async () => {
    // Confirmarla sería dar por escrito algo que nadie escribió.
    const bandeja = conTres();
    const nube = nubeQueResponde((lote) =>
      lote
        .filter((e) => e.claveIdempotencia !== 'a')
        .map((e) => ({ claveIdempotencia: e.claveIdempotencia, aceptado: true, duplicado: false })),
    );
    const r = await new Reconciliacion(bandeja, nube, opciones).ejecutar(AHORA);
    expect(r.creados).toBe(0);
    expect(bandeja.confirmadas).toEqual([]);
    expect(bandeja.fallidas[0]?.error).toContain('no devolvió resultado');
  });

  it('una excepción de red marca SOLO el primero', async () => {
    // Marcar los cincuenta multiplicaría por cincuenta el retroceso de una cola
    // que en realidad falló una vez.
    const bandeja = conTres();
    const nube: ClienteDeNube = {
      reconciliar: async () => {
        throw new Error('sin conexión');
      },
      descargarReglas: async () => null,
    };
    const r = await new Reconciliacion(bandeja, nube, opciones).ejecutar(AHORA);
    expect(r.fallidos).toBe(1);
    expect(bandeja.fallidas).toHaveLength(1);
    expect(bandeja.fallidas[0]?.clave).toBe('a');
  });

  it('la bandeja vacía no llama a la nube', async () => {
    const bandeja = new BandejaFalsa();
    let llamadas = 0;
    const nube = nubeQueResponde(() => {
      llamadas += 1;
      return [];
    });
    const r = await new Reconciliacion(bandeja, nube, opciones).ejecutar(AHORA);
    expect(llamadas).toBe(0);
    expect(r.quedanPendientes).toBe(false);
  });
});

describe('retroceso exponencial · el jitter RESTA, nunca suma', () => {
  it('crece con el intento y respeta el tope', () => {
    expect(esperaDelIntento(1, 1000, () => 1)).toBe(1000);
    expect(esperaDelIntento(2, 1000, () => 1)).toBe(2000);
    expect(esperaDelIntento(3, 1000, () => 1)).toBe(4000);
    // Tope de 5 minutos: sin él, el intento 20 esperaría semanas.
    expect(esperaDelIntento(30, 1000, () => 1)).toBe(300_000);
  });

  it('nunca supera el nominal: el tope configurado sigue siendo un tope', () => {
    for (let intento = 1; intento <= 10; intento += 1) {
      const nominal = esperaDelIntento(intento, 1000, () => 1);
      for (const azar of [0, 0.25, 0.5, 0.75, 0.999]) {
        const conJitter = esperaDelIntento(intento, 1000, () => azar);
        expect(conJitter).toBeLessThanOrEqual(nominal);
        expect(conJitter).toBeGreaterThanOrEqual(Math.floor(nominal * 0.5));
      }
    }
  });
});

describe('lo que se rinde NO se borra', () => {
  it('se reconoce por los intentos, y sigue en la bandeja con su clave', () => {
    const envio: EnvioPendiente = {
      claveIdempotencia: 'a',
      secuencia: 1,
      cuerpo: '{}',
      encoladoEn: AHORA.toISOString(),
      intentos: 8,
      proximoIntentoEn: null,
      ultimoError: 'sin conexión',
    };
    expect(seRindio(envio, 8)).toBe(true);
    expect(seRindio({ ...envio, intentos: 7 }, 8)).toBe(false);
    // Borrarlo sería perder un acceso que ocurrió de verdad (RN-02).
  });
});
