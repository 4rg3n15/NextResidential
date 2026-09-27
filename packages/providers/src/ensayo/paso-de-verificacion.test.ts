import { describe, expect, it } from 'vitest';
import {
  ACCION_DE_VERIFICACION_LENTA,
  juzgarVerificaciones,
  pasoDeVerificacion,
  percentil,
} from './paso-de-verificacion';
import type { OpcionesDeEnsayo, VerificacionesDeLaPlataforma } from './tipos';
import { CAPACIDADES_SIN_CONSULTAR } from '../nucleo/capacidades';
import { LIMITES_DE_FOTO_POR_OMISION } from '../terminal/foto-del-rostro';
import { VerificacionesSimuladas } from '../simulacion/verificaciones-simuladas';
import {
  FlujoEnVivo,
  desenlacesDeVerificacionPor,
  equipoSimulado,
} from '../simulacion/equipo-simulado';

/**
 * F2 (corrección de la 15-L) · paso 9: cinco presentaciones, p50 y p95 contra
 * el plazo con el que la terminal niega sola.
 */
const medidas = (...ms: number[]) => ms.map((duracionMs) => ({ duracionMs, aceptado: true }));

describe('percentil más cercano, como los tableros de la API', () => {
  it('nunca devuelve una duración que no se midió; ordena una copia', () => {
    const muestras = [900, 100, 500, 300, 700];
    expect(percentil(muestras, 50)).toBe(500);
    expect(percentil(muestras, 95)).toBe(900);
    expect(percentil(muestras, 0)).toBe(100);
    expect(percentil(muestras, 150)).toBe(900);
    expect(muestras).toEqual([900, 100, 500, 300, 700]);
    expect(percentil([], 50)).toBeNull();
  });
});

describe('el juicio de las medidas contra el plazo', () => {
  it('OK por debajo del plazo, con p50, p95 y las cinco duraciones', () => {
    const r = juzgarVerificaciones(medidas(400, 1200, 800, 600, 1000), 5, 8);
    expect(r.estado).toBe('ok');
    expect(r.numero).toBe(9);
    expect(r.causa).toBe('p50 800 ms · p95 1200 ms, por debajo del plazo de la terminal (8 s)');
    expect(r.detalle).toContain('duraciones: 400, 1200, 800, 600, 1000 ms');
  });

  it('FALLO si el p95 ALCANZA el plazo: con el plan B y el precalentamiento', () => {
    const r = juzgarVerificaciones(medidas(400, 500, 600, 700, 8000), 5, 8);
    expect(r.estado).toBe('fallo');
    expect(r.causa).toMatch(/p95 8000 ms: el p95 alcanza el plazo de la terminal \(8 s\)/);
    expect(r.accion).toBe(ACCION_DE_VERIFICACION_LENTA);
    expect(r.accion).toMatch(/«Verificación remota: desactivar»/);
    expect(r.accion).toMatch(/precalentamiento/);
  });

  it('FALLO si la terminal rechazó un veredicto, si faltan o si no hubo ninguno', () => {
    const rechazado = juzgarVerificaciones(
      [...medidas(100, 100, 100, 100), { duracionMs: 100, aceptado: false }],
      5,
      8,
    );
    expect(rechazado.causa).toMatch(/NO aceptó 1 de 5 veredictos/);
    expect(juzgarVerificaciones(medidas(100, 100, 100), 5, 8).causa).toMatch(
      /sólo 3 de 5 presentaciones llegaron a veredicto/,
    );
    const ninguno = juzgarVerificaciones([], 5, 8);
    expect(ninguno.estado).toBe('fallo');
    expect(ninguno.causa).toMatch(/no registró ningún veredicto/);
  });
});

describe('paso 9 · cuándo se mide y cuándo no', () => {
  const opciones = (
    familia: OpcionesDeEnsayo['equipo']['familia'],
    verificaciones?: VerificacionesDeLaPlataforma,
  ): OpcionesDeEnsayo => ({
    equipo: {
      familia,
      host: '192.0.2.31',
      usuario: 'servicio',
      clave: 'p1',
      puerta: 1,
      canalDeVideo: '102',
      puertoRtsp: 554,
    },
    interlocutor: { indicar: async () => undefined, confirmar: async () => true },
    soloLectura: false,
    esperaDeEventoMs: 30_000,
    limitesDeFoto: LIMITES_DE_FOTO_POR_OMISION,
    zona: 'America/Bogota',
    ahora: () => new Date('2026-09-27T15:00:00Z'),
    ...(verificaciones === undefined ? {} : { verificaciones }),
  });
  const conVerificacion = { ...CAPACIDADES_SIN_CONSULTAR, verificacionRemota: 'si' as const };

  it('la cámara y el videoportero no esperan veredicto: NO APLICA', async () => {
    expect((await pasoDeVerificacion(opciones('camara'), null)).estado).toBe('no_aplica');
    expect((await pasoDeVerificacion(opciones('videoportero'), null)).estado).toBe('no_aplica');
  });

  it('sin la base, o con la verificación remota apagada: OMITIDO, y dice por qué', async () => {
    const sinBase = await pasoDeVerificacion(opciones('terminal'), conVerificacion);
    expect(sinBase.estado).toBe('omitido');
    expect(sinBase.causa).toMatch(/--sin-plataforma o sin DATABASE_URL/);
    const nada: VerificacionesDeLaPlataforma = { medidasDesde: async () => [] };
    const apagada = await pasoDeVerificacion(opciones('terminal', nada), CAPACIDADES_SIN_CONSULTAR);
    expect(apagada.estado).toBe('omitido');
    expect(apagada.causa).toMatch(/no espera el veredicto/);
  });

  it('pide cinco presentaciones y lee las cinco de la plataforma, por host y desde ahora', async () => {
    const pedidas: unknown[] = [];
    const plataforma: VerificacionesDeLaPlataforma = {
      medidasDesde: async (host, desde, cuantas, plazo) => {
        pedidas.push({ host, desde: desde.toISOString(), cuantas, plazo });
        return medidas(300, 350, 400, 420, 500);
      },
    };
    const o = { ...opciones('terminal', plataforma), plazoDeVerificacionS: 2 };
    const r = await pasoDeVerificacion(o, conVerificacion);
    expect(r.estado).toBe('ok');
    expect(r.causa).toMatch(/plazo de la terminal \(2 s\)/);
    expect(pedidas).toEqual([
      { host: '192.0.2.31', desde: '2026-09-27T15:00:00.000Z', cuantas: 5, plazo: 30_000 },
    ]);
  });
});

describe('--simulado · cinco ciclos completos con las piezas de producción', () => {
  it('la terminal simulada pregunta, la plataforma contesta a tiempo y la puerta abre', async () => {
    const destino = 'terminal-f2.invalid';
    const flujo = new FlujoEnVivo();
    const conexion = {
      host: destino,
      usuario: 'servicio',
      clave: 'p1',
      peticion: equipoSimulado({
        familia: 'terminal',
        usuario: 'servicio',
        clave: 'p1',
        destino,
        enVivo: flujo,
      }),
    };
    let t = 0;
    const verificaciones = new VerificacionesSimuladas({ conexion, flujo }, () => (t += 7));
    const m = await verificaciones.medidasDesde(destino, new Date(), 5, 5000);
    expect(m).toEqual(medidas(7, 7, 7, 7, 7));
    expect(desenlacesDeVerificacionPor.get(destino)?.map((d) => d.desenlace)).toEqual([
      'abrio',
      'abrio',
      'abrio',
      'abrio',
      'abrio',
    ]);
  });
});
