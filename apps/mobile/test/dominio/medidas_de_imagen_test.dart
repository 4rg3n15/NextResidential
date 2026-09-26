import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/calidad_de_captura.dart';
import 'package:ncr_residente/dominio/medidas_de_imagen.dart';

/// Paridad con la consola (`apps/web/src/lib/biometria/medidas.test.ts`): las
/// mismas fórmulas dan los mismos números sobre los mismos píxeles.
Uint8List lienzo(int ancho, int alto, int Function(int x, int y) gris) {
  final b = Uint8List(ancho * alto * 4);
  for (var y = 0; y < alto; y++) {
    for (var x = 0; x < ancho; x++) {
      final i = (y * ancho + x) * 4;
      final g = gris(x, y);
      b[i] = g;
      b[i + 1] = g;
      b[i + 2] = g;
      b[i + 3] = 255;
    }
  }
  return b;
}

void main() {
  test('iluminación: negro 0, blanco 1, gris medio ~0,5', () {
    expect(iluminacionDe(lienzo(8, 8, (_, _) => 0)), 0);
    expect(iluminacionDe(lienzo(8, 8, (_, _) => 255)), closeTo(1, 1e-9));
    expect(iluminacionDe(lienzo(8, 8, (_, _) => 128)), closeTo(128 / 255, 1e-9));
    expect(iluminacionDe(Uint8List(0)), 0);
  });

  test('nitidez: una superficie lisa es 0; un tablero de ajedrez satura en 1', () {
    expect(nitidezDe(lienzo(16, 16, (_, _) => 90), 16, 16), 0);
    expect(nitidezDe(lienzo(16, 16, (x, y) => (x + y).isEven ? 0 : 255), 16, 16), 1);
    expect(nitidezDe(Uint8List(0), 2, 2), 0);
  });

  test('sin detector: cero rostros hasta confirmar el encuadre; nunca se inventan', () {
    final m = medidasSinDetector(lienzo(16, 16, (x, y) => (x + y).isEven ? 60 : 200), 16, 16);
    expect(m.rostrosDetectados, 0);
    expect(evaluarCaptura(m), contains(FalloDeCalidad.sinRostro));
    final confirmada = conEncuadreConfirmado(m);
    expect(confirmada.rostrosDetectados, 1);
    expect(confirmada.proporcionRostro, proporcionConfirmada);
    expect(evaluarCaptura(confirmada), isEmpty);
  });
}
