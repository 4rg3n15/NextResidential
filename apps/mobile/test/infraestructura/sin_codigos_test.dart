import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/infraestructura/api/soporte_de_api.dart';

/// Bloque I (15-L) · los rechazos de la API llegan a la pantalla sin la cita de
/// la regla que los produce. Los textos son los que la API devuelve hoy.
void main() {
  test('quita las citas entre paréntesis y la de entrada', () {
    expect(
      sinCodigosDelProyecto('Tiene historial. Dele de baja en vez de borrarla (RN-19)'),
      'Tiene historial. Dele de baja en vez de borrarla',
    );
    expect(sinCodigosDelProyecto('La vivienda no existe (HU-01, RN-13)'), 'La vivienda no existe');
    expect(sinCodigosDelProyecto('Ese número ya está en uso (D6)'), 'Ese número ya está en uso');
    expect(
      sinCodigosDelProyecto('D-11 · la placa no está en la lista blanca'),
      'la placa no está en la lista blanca',
    );
  });

  test('no toca un paréntesis que no es un código', () {
    expect(
      sinCodigosDelProyecto('Equipo (cámara de la entrada) sin respuesta'),
      'Equipo (cámara de la entrada) sin respuesta',
    );
  });

  test('se aplica al leer el error de la API, en sus tres formas', () {
    expect(detalleDeError({'mensaje': 'Motivo obligatorio (RN-19)'}), 'Motivo obligatorio');
    expect(
      detalleDeError({
        'mensaje': {'message': 'Esa visita no es de su vivienda (RN-15)'},
      }),
      'Esa visita no es de su vivienda',
    );
    expect(
      detalleDeError({
        'mensaje': {
          'message': ['Uno (RN-04)', 'Dos (KPI-03)'],
        },
      }),
      'Uno, Dos',
    );
  });
}
