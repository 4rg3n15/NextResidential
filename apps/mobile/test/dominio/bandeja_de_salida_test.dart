import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/bandeja_de_salida.dart';

final t0 = DateTime.utc(2026, 9, 19, 12);

EnvioPendiente visita(String clave) => EnvioPendiente(
      claveDeIdempotencia: clave,
      recurso: 'mi/autorizaciones',
      cuerpo: const {'visitante': 'Alguien'},
      encoladoEn: t0,
    );

void main() {
  group('encolar · la clave de idempotencia es la identidad', () {
    test('dos pulsaciones del mismo botón encolan UNA vez', () {
      final b = const BandejaDeSalida([]).encolar(visita('k1')).encolar(visita('k1'));
      expect(b.pendientes, hasLength(1));
    });

    test('dos visitas distintas conviven', () {
      final b = const BandejaDeSalida([]).encolar(visita('k1')).encolar(visita('k2'));
      expect(b.pendientes, hasLength(2));
    });
  });

  group('listosEn · qué toca enviar ahora', () {
    test('lo recién encolado está listo', () {
      final b = const BandejaDeSalida([]).encolar(visita('k1'));
      expect(b.listosEn(t0), hasLength(1));
    });

    test('lo que espera NO está listo hasta que cumple', () {
      final b = const BandejaDeSalida([])
          .encolar(visita('k1'))
          .fallo('k1', t0, 'sin red', aleatorio: () => 0.0);
      final esperado = b.pendientes.single.proximoIntentoEn!;

      expect(b.listosEn(t0), isEmpty);
      expect(b.listosEn(esperado.subtract(const Duration(milliseconds: 1))), isEmpty);
      expect(b.listosEn(esperado), hasLength(1));
    });

    test('el orden es el de encolado: es el que el residente recuerda', () {
      final b = const BandejaDeSalida([])
          .encolar(visita('primera'))
          .encolar(visita('segunda'));
      expect(
        b.listosEn(t0).map((p) => p.claveDeIdempotencia),
        equals(['primera', 'segunda']),
      );
    });
  });

  group('esperaAntesDe · exponencial, con tope y con jitter', () {
    test('crece exponencialmente desde la base', () {
      expect(esperaAntesDe(1, aleatorio: () => 0.0).inSeconds, 2);
      expect(esperaAntesDe(2, aleatorio: () => 0.0).inSeconds, 4);
      expect(esperaAntesDe(3, aleatorio: () => 0.0).inSeconds, 8);
    });

    test('y NUNCA pasa del tope', () {
      // Sin tope, el intento 8 caería a las cuatro horas.
      for (var i = 1; i <= 12; i++) {
        expect(esperaAntesDe(i, aleatorio: () => 0.0).inSeconds, lessThanOrEqualTo(60));
      }
    });

    test('el jitter RESTA: nunca supera lo prometido', () {
      final sinJitter = esperaAntesDe(4, aleatorio: () => 0.0);
      final conJitter = esperaAntesDe(4, aleatorio: () => 1.0);
      expect(conJitter, lessThan(sinJitter));
      // Y no lo convierte en cero: mil teléfonos reintentando a la vez es lo
      // que se quiere evitar, no adelantarlos todos.
      expect(conJitter.inMilliseconds, greaterThan(0));
    });

    test('el intento cero no espera', () {
      expect(esperaAntesDe(0), Duration.zero);
    });
  });

  group('rendidos · lo que no se envió NO se borra en silencio', () {
    test('tras agotar los intentos, el envío sigue ahí y se puede nombrar', () {
      var b = const BandejaDeSalida([]).encolar(visita('k1'));
      var ahora = t0;
      for (var i = 0; i < 8; i++) {
        b = b.fallo('k1', ahora, 'sin red', aleatorio: () => 0.0);
        ahora = b.pendientes.single.proximoIntentoEn!;
      }
      expect(b.rendidos(), hasLength(1));
      expect(b.pendientes.single.ultimoError, 'sin red');
      // La clave se conserva: el reintento a mano sigue siendo idempotente.
      expect(b.pendientes.single.claveDeIdempotencia, 'k1');
    });

    test('antes de agotarlos, no se da por rendido', () {
      final b = const BandejaDeSalida([])
          .encolar(visita('k1'))
          .fallo('k1', t0, 'sin red', aleatorio: () => 0.0);
      expect(b.rendidos(), isEmpty);
    });
  });

  test('quitar · el envío confirmado desaparece', () {
    final b = const BandejaDeSalida([]).encolar(visita('k1')).encolar(visita('k2')).quitar('k1');
    expect(b.pendientes.map((p) => p.claveDeIdempotencia), equals(['k2']));
  });
}
