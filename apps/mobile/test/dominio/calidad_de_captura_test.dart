import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/calidad_de_captura.dart';

/// Una captura que pasa todo. Cada prueba estropea UNA medida.
const buena = MedidasDeCaptura(
  nitidez: 0.8,
  iluminacion: 0.5,
  rostrosDetectados: 1,
  proporcionRostro: 0.4,
);

void main() {
  group('evaluarCaptura · las cuatro validaciones de CA-08', () {
    test('una captura buena no tiene fallos', () {
      expect(evaluarCaptura(buena), isEmpty);
      expect(capturaAceptable(buena), isTrue);
    });

    test('borrosa', () {
      expect(
        evaluarCaptura(const MedidasDeCaptura(
          nitidez: 0.2,
          iluminacion: 0.5,
          rostrosDetectados: 1,
          proporcionRostro: 0.4,
        )),
        contains(FalloDeCalidad.borrosa),
      );
    });

    test('oscura y quemada son dos fallos distintos, no «mala iluminación»', () {
      // Juntarlos daría un consejo inútil: «arregle la luz». Lo que se puede
      // obedecer es «busque más luz» o «quítese el sol de la espalda».
      expect(
        evaluarCaptura(const MedidasDeCaptura(
          nitidez: 0.8,
          iluminacion: 0.05,
          rostrosDetectados: 1,
          proporcionRostro: 0.4,
        )),
        contains(FalloDeCalidad.oscura),
      );
      expect(
        evaluarCaptura(const MedidasDeCaptura(
          nitidez: 0.8,
          iluminacion: 0.95,
          rostrosDetectados: 1,
          proporcionRostro: 0.4,
        )),
        contains(FalloDeCalidad.quemada),
      );
    });

    test('sin rostro, y entonces NO se aconseja acercarse', () {
      final fallos = evaluarCaptura(const MedidasDeCaptura(
        nitidez: 0.8,
        iluminacion: 0.5,
        rostrosDetectados: 0,
        proporcionRostro: 0.0,
      ));
      expect(fallos, contains(FalloDeCalidad.sinRostro));
      expect(fallos, isNot(contains(FalloDeCalidad.demasiadoLejos)));
    });

    test('varios rostros: la plantilla es de UNA persona', () {
      expect(
        evaluarCaptura(const MedidasDeCaptura(
          nitidez: 0.8,
          iluminacion: 0.5,
          rostrosDetectados: 2,
          proporcionRostro: 0.4,
        )),
        contains(FalloDeCalidad.variosRostros),
      );
    });

    test('demasiado lejos y demasiado cerca', () {
      expect(
        evaluarCaptura(const MedidasDeCaptura(
          nitidez: 0.8,
          iluminacion: 0.5,
          rostrosDetectados: 1,
          proporcionRostro: 0.05,
        )),
        contains(FalloDeCalidad.demasiadoLejos),
      );
      expect(
        evaluarCaptura(const MedidasDeCaptura(
          nitidez: 0.8,
          iluminacion: 0.5,
          rostrosDetectados: 1,
          proporcionRostro: 0.9,
        )),
        contains(FalloDeCalidad.demasiadoCerca),
      );
    });
  });

  group('evaluarCaptura · devuelve TODOS los fallos, no el primero', () {
    test('una foto mala de verdad los acumula', () {
      // Es la razón de ser del diseño: con el primero, el residente repetiría
      // la foto tres veces para tres problemas que ve de una sola vez.
      final fallos = evaluarCaptura(const MedidasDeCaptura(
        nitidez: 0.1,
        iluminacion: 0.05,
        rostrosDetectados: 2,
        proporcionRostro: 0.02,
      ));
      expect(fallos, containsAll([
        FalloDeCalidad.borrosa,
        FalloDeCalidad.oscura,
        FalloDeCalidad.variosRostros,
        FalloDeCalidad.demasiadoLejos,
      ]));
    });

    test('el orden es estable entre llamadas', () {
      const mala = MedidasDeCaptura(
        nitidez: 0.1,
        iluminacion: 0.05,
        rostrosDetectados: 1,
        proporcionRostro: 0.02,
      );
      expect(evaluarCaptura(mala), equals(evaluarCaptura(mala)));
    });
  });

  group('consejoPara · se puede obedecer', () {
    test('todos los fallos tienen consejo, en imperativo y sin jerga', () {
      for (final f in FalloDeCalidad.values) {
        final texto = consejoPara(f);
        expect(texto.length, greaterThan(20));
        expect(texto, isNot(contains('proporción')));
        expect(texto, isNot(contains(f.name)));
      }
    });
  });
}
