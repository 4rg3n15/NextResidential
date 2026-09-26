/// Medir una foto: iluminación y nitidez, a partir de sus píxeles (15-I, hito 3).
///
/// Las MISMAS fórmulas que la consola (`apps/web/src/lib/biometria/medidas.ts`):
/// luminancia Rec. 601, iluminación = luminancia media muestreando uno de cada
/// cuatro píxeles, nitidez = varianza del laplaciano normalizada contra 600. Si
/// la app y la consola juzgaran la misma foto con fórmulas distintas, habría un
/// «sirve aquí y no allí» que nadie sabría explicar. La prueba de paridad usa
/// los mismos casos que la de la consola.
///
/// Funciones puras sobre RGBA: sin cámara, sin plataforma, sin paquetes.
library;

import 'dart:typed_data';

import 'calidad_de_captura.dart';

/// La varianza del laplaciano a partir de la cual la foto es nítida del todo.
const referenciaDeVarianza = 600.0;

double _luminancia(int r, int g, int b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/// 0 negra · 0,5 bien expuesta · 1 quemada.
double iluminacionDe(Uint8List rgba) {
  if (rgba.length < 4) return 0;
  var suma = 0.0;
  var cuenta = 0;
  for (var i = 0; i + 2 < rgba.length; i += 16) {
    suma += _luminancia(rgba[i], rgba[i + 1], rgba[i + 2]);
    cuenta += 1;
  }
  return cuenta == 0 ? 0 : suma / cuenta;
}

/// Varianza del laplaciano, normalizada a 0..1.
double nitidezDe(Uint8List rgba, int ancho, int alto) {
  if (ancho < 3 || alto < 3 || rgba.length < ancho * alto * 4) return 0;
  final gris = Float64List(ancho * alto);
  for (var p = 0, i = 0; p < gris.length; p += 1, i += 4) {
    gris[p] = _luminancia(rgba[i], rgba[i + 1], rgba[i + 2]) * 255;
  }
  var suma = 0.0;
  var sumaCuadrados = 0.0;
  var cuenta = 0;
  for (var y = 1; y < alto - 1; y += 1) {
    for (var x = 1; x < ancho - 1; x += 1) {
      final c = y * ancho + x;
      final v = 4 * gris[c] - gris[c - 1] - gris[c + 1] - gris[c - ancho] - gris[c + ancho];
      suma += v;
      sumaCuadrados += v * v;
      cuenta += 1;
    }
  }
  if (cuenta == 0) return 0;
  final media = suma / cuenta;
  final varianza = sumaCuadrados / cuenta - media * media;
  return (varianza / referenciaDeVarianza).clamp(0.0, 1.0);
}

/// La proporción que se declara cuando quien captura CONFIRMA el encuadre.
/// Sin detector de rostros en el teléfono, el conteo y la proporción no salen
/// de la foto: los sustituye la confirmación de la persona, como en la consola.
const proporcionConfirmada = 0.4;

/// Las medidas de una foto recién tomada: sin detector, cero rostros hasta que
/// el residente confirme el encuadre (`conEncuadreConfirmado`).
MedidasDeCaptura medidasSinDetector(Uint8List rgba, int ancho, int alto) => MedidasDeCaptura(
      nitidez: nitidezDe(rgba, ancho, alto),
      iluminacion: iluminacionDe(rgba),
      rostrosDetectados: 0,
      proporcionRostro: 0,
    );

MedidasDeCaptura conEncuadreConfirmado(MedidasDeCaptura m) => MedidasDeCaptura(
      nitidez: m.nitidez,
      iluminacion: m.iluminacion,
      rostrosDetectados: 1,
      proporcionRostro: proporcionConfirmada,
    );
