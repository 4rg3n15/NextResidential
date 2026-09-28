import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/notificaciones.dart';

Notificacion n(
  TipoDeNotificacion tipo, {
  String id = 'n-1',
  String? visitante,
  String? motivo,
}) =>
    Notificacion(
      id: id,
      tipo: tipo,
      en: DateTime.utc(2026, 9, 20, 14),
      visitante: visitante,
      motivo: motivo,
    );

void main() {
  group('la frase que ve el residente', () {
    test('rechazada, con quién y con el motivo de portería', () {
      expect(
        n(TipoDeNotificacion.visitaRechazada, visitante: 'Ana', motivo: ' No la esperan ').texto,
        'Rechazaron la visita de Ana: No la esperan',
      );
    });

    test('rechazada sin motivo ni nombre sigue siendo una frase', () {
      expect(n(TipoDeNotificacion.visitaRechazada, visitante: 'Ana').texto,
          'Rechazaron la visita de Ana.');
      expect(n(TipoDeNotificacion.visitaRechazada, motivo: '').texto,
          'Rechazaron una de sus visitas.');
    });

    test('el ingreso', () {
      expect(n(TipoDeNotificacion.ingresoDeVisitante, visitante: 'Luis').texto, 'Luis ingresó');
      expect(n(TipoDeNotificacion.ingresoDeVisitante).texto, 'Ingresó uno de sus visitantes');
    });

    test('un tipo que el servidor añada mañana no se adivina', () {
      expect(n(TipoDeNotificacion.otra, visitante: 'Ana').texto, 'Hay una novedad en sus visitas');
    });
  });

  test('cuántas sin ver: las que no están entre las vistas', () {
    final lista = [
      n(TipoDeNotificacion.ingresoDeVisitante, id: 'a'),
      n(TipoDeNotificacion.ingresoDeVisitante, id: 'b'),
      n(TipoDeNotificacion.visitaRechazada, id: 'c'),
    ];
    expect(cuantasSinVer(lista, {}), 3);
    expect(cuantasSinVer(lista, {'a', 'c', 'vieja'}), 1);
    expect(cuantasSinVer(const [], {'a'}), 0);
  });
}
