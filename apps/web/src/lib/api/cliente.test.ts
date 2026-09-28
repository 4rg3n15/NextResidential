import { describe, expect, it } from 'vitest';
import { rechazosPorCampo, sinCodigosDelProyecto, textoDelError } from './cliente';

/**
 * BLOQUE I (15-L) · los rechazos de la API citan la regla que los produce; la
 * consola pinta el mensaje sin la cita. Los textos de estos casos son los que
 * la API devuelve hoy.
 */
describe('mensajes de la API sin códigos del proyecto', () => {
  it.each([
    [
      'Tiene historial. Dele de baja en vez de borrarla (RN-19)',
      'Tiene historial. Dele de baja en vez de borrarla',
    ],
    ['La vivienda no existe (HU-01, RN-13)', 'La vivienda no existe'],
    ['Ese número ya está en uso (D6)', 'Ese número ya está en uso'],
    ['D-11 · la placa no está en la lista blanca', 'la placa no está en la lista blanca'],
    ['Sin cambios', 'Sin cambios'],
  ])('«%s» → «%s»', (entrada, salida) => {
    expect(sinCodigosDelProyecto(entrada)).toBe(salida);
    expect(sinCodigosDelProyecto(entrada)).not.toMatch(/\b(?:RN|HU|KPI|D)-?\d/);
  });

  it('no toca paréntesis que no son códigos', () => {
    expect(sinCodigosDelProyecto('Equipo (cámara de la entrada) sin respuesta')).toBe(
      'Equipo (cámara de la entrada) sin respuesta',
    );
  });

  it('se aplica al mensaje, a la lista de mensajes y a los rechazos por campo', () => {
    expect(textoDelError({ mensaje: 'Motivo obligatorio (RN-19)' })).toBe('Motivo obligatorio');
    expect(textoDelError({ mensaje: { message: ['Uno (RN-04)', 'Dos (KPI-03)'] } })).toBe(
      'Uno. Dos',
    );
    expect(
      rechazosPorCampo({ mensaje: { rechazos: [{ clave: 'placa', motivo: 'Repetida (RN-04)' }] } }),
    ).toEqual({ placa: 'Repetida' });
  });
});
