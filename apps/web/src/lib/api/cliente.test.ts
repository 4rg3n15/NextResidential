import { describe, expect, it } from 'vitest';
import {
  motivosDeFotoDelError,
  rechazosPorCampo,
  sinCodigosDelProyecto,
  textoDelError,
} from './cliente';

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

  it('15-Z2 (DT-15W-05) · los `campos` de un 400 de forma también van bajo su campo', () => {
    expect(
      rechazosPorCampo({
        mensaje: {
          message: 'Revise los datos: placa debe ser texto',
          campos: [
            { campo: 'placa', motivo: 'debe ser texto' },
            { campo: 'extra', motivo: 'no se admite este campo' },
          ],
        },
      }),
    ).toEqual({ placa: 'debe ser texto', extra: 'no se admite este campo' });
  });
});

/**
 * D-72 · LOS MOTIVOS DEL RECHAZO DE UNA FOTO NO PUEDEN PERDERSE EN EL CLIENTE
 *
 * Visto en sitio el 19/10, registrando el rostro de un residente: la pantalla
 * enseñaba «La foto no sirve para reconocer el rostro» y nada más. La API
 * estaba devolviendo en ese mismo 400 cuál de las medidas había fallado
 * —`motivos: ['ILUMINACION']`— y `ErrorDeApi` no los llevaba, así que la
 * persona repetía la foto a ciegas. Como `rechazosPorCampo`, van DENTRO de
 * `mensaje`: el filtro global de la API envuelve todo error en `{ estado,
 * correlacion, mensaje }`, y leerlos del nivel superior es el error fácil.
 */
describe('motivosDeFotoDelError', () => {
  it('los lee de dentro de `mensaje`, que es donde los pone el filtro global', () => {
    expect(
      motivosDeFotoDelError({
        estado: 400,
        mensaje: { message: 'La foto no sirve', motivos: ['ILUMINACION', 'NITIDEZ'] },
      }),
    ).toEqual(['ILUMINACION', 'NITIDEZ']);
  });

  it('no los busca en el nivel superior: ahí nunca están', () => {
    expect(motivosDeFotoDelError({ estado: 400, motivos: ['NITIDEZ'] })).toBeUndefined();
  });

  it('sin motivos no inventa una lista vacía', () => {
    for (const cuerpo of [
      undefined,
      null,
      'texto',
      { estado: 400 },
      { estado: 400, mensaje: 'La foto no sirve' },
      { estado: 400, mensaje: { motivos: [] } },
      { estado: 400, mensaje: { motivos: 'ILUMINACION' } },
    ]) {
      expect(motivosDeFotoDelError(cuerpo)).toBeUndefined();
    }
  });

  it('descarta lo que no sea texto sin tirar el resto', () => {
    expect(motivosDeFotoDelError({ mensaje: { motivos: ['SIN_ROSTRO', 7, null] } })).toEqual([
      'SIN_ROSTRO',
    ]);
  });
});
