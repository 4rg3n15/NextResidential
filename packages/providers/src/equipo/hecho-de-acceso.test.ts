import { describe, expect, it } from 'vitest';
import type { EventoDeEquipo } from '../hikvision/contratos-de-evento';
import { desdeAlarmServerXml } from '../hikvision/contratos-de-evento';
import { abrirSobreDeAlarmServer } from '../hikvision/publicacion-alarm-server';
import { sobreDeLectura } from '../simulacion/camara-que-publica';
import {
  CONFIANZA_DE_ROSTRO_RECONOCIDO,
  hechoDeAccesoDe,
  referenciaDePlaca,
  referenciaDeRostro,
} from './hecho-de-acceso';

/**
 * 15-Q · Q3 · el hecho de acceso de un evento es UNO para la nube y el Edge.
 *
 * Lo que aquí se fija es lo que hace coincidir la clave de idempotencia de los
 * dos caminos: si la referencia cambiara de forma en uno de ellos, el mismo
 * paso por la talanquera quedaría dos veces en el histórico.
 */
const evento = (extra: Partial<EventoDeEquipo> = {}): EventoDeEquipo => ({
  clase: 'rostro',
  placa: null,
  confianza: null,
  dispositivoId: 'terminal-1',
  ocurridoEn: new Date('2026-10-02T12:00:00Z'),
  enVivo: true,
  referenciaDelEquipo: null,
  quienAbrio: null,
  tipoDePlaca: null,
  colorDePlaca: null,
  pais: null,
  carril: null,
  sentido: null,
  tipoDeVehiculo: null,
  tipoDeDeteccion: null,
  placaEstandar: null,
  recuadro: null,
  horaSinDesplazamiento: false,
  personaId: 'plantilla-77',
  esperaVeredicto: true,
  serieDelEquipo: 4711,
  esResultadoDeVerificacion: false,
  origenDeLlamada: null,
  unidadDeLlamada: null,
  edificioDeLlamada: null,
  tipo: 'rostro_reconocido',
  titulo: 'Rostro reconocido',
  codigo: null,
  horaDelEquipo: null,
  carga: {},
  ...extra,
});

describe('hecho de acceso de un evento de equipo (15-Q, Q3)', () => {
  it('una lectura de placa real del Alarm Server da el hecho de placa con su referencia', () => {
    const sobre = sobreDeLectura({ placa: 'ABC123', confianza: 88, referencia: 'ev-42' });
    const abierto = abrirSobreDeAlarmServer(sobre.cuerpo, sobre.tipoDeContenido);
    const leido = desdeAlarmServerXml(abierto.documento, 'camara-1', new Date());
    expect(leido).not.toBeNull();
    const hecho = hechoDeAccesoDe(leido as EventoDeEquipo);
    expect(hecho).toMatchObject({
      metodo: 'placa',
      referenciaExterna: 'ev-42',
      placaLeida: 'ABC123',
      plantillaId: null,
      esperaVeredicto: false,
    });
    expect(hecho?.confianza).toBeCloseTo(0.88, 5);
  });

  it('sin referencia del equipo, la de placa es placa + instante (como la API desde la 15-D)', () => {
    const e = evento({ clase: 'placa', placa: 'XYZ987', personaId: null });
    expect(referenciaDePlaca(e)).toBe(`XYZ987-${String(+e.ocurridoEn)}`);
    expect(hechoDeAccesoDe(e)?.referenciaExterna).toBe(referenciaDePlaca(e));
  });

  it('una placa sin confianza declarada va con 0, nunca con certeza', () => {
    expect(hechoDeAccesoDe(evento({ clase: 'placa', placa: 'XYZ987' }))?.confianza).toBe(0);
  });

  it('el rostro lleva la PLANTILLA (no la persona), la serie y la confianza S-40', () => {
    const hecho = hechoDeAccesoDe(evento());
    expect(hecho).toEqual({
      metodo: 'facial',
      referenciaExterna: 'plantilla-77-4711',
      confianza: CONFIANZA_DE_ROSTRO_RECONOCIDO,
      placaLeida: null,
      plantillaId: 'plantilla-77',
      esperaVeredicto: true,
    });
  });

  it('el rostro sin serie ni plantilla cae en «desconocida» + instante', () => {
    const e = evento({ personaId: null, serieDelEquipo: null });
    expect(referenciaDeRostro(e)).toBe(`desconocida-${String(+e.ocurridoEn)}`);
  });

  it('la referencia del equipo, cuando la hay, manda en los dos casos', () => {
    expect(referenciaDeRostro(evento({ referenciaDelEquipo: 'R-1' }))).toBe('R-1');
    expect(referenciaDePlaca(evento({ clase: 'placa', referenciaDelEquipo: 'P-1' }))).toBe('P-1');
  });

  it.each([
    ['histórico', evento({ enVivo: false })],
    ['resultado de una verificación ya contestada', evento({ esResultadoDeVerificacion: true })],
    ['vehículo sin lectura', evento({ clase: 'placa', placa: null })],
    ['llamada', evento({ clase: 'llamada' })],
    ['evento de equipo (puerta, botón, sabotaje)', evento({ clase: 'equipo' })],
  ])('no es un acceso: %s', (_caso, e) => {
    expect(hechoDeAccesoDe(e)).toBeNull();
  });
});
