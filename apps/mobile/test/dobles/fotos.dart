import 'dart:math';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Un JPEG que se parece a una foto, para las pruebas de la cámara y de la
/// galería: las dos pasan por la misma reducción y se prueban con los mismos
/// bytes. Un degradado con algo de ruido: se parece más a una foto que el
/// ruido puro, que ningún JPEG comprime y no representa lo que entrega una
/// cámara.
Uint8List jpegDeFoto(int ancho, int alto, {int calidad = 95, int ruido = 40}) {
  final azar = Random(7);
  final i = img.Image(width: ancho, height: alto);
  for (final p in i) {
    final base = (p.x * 255 ~/ ancho + p.y * 255 ~/ alto) ~/ 2;
    int v() => (base + azar.nextInt(ruido) - ruido ~/ 2).clamp(0, 255);
    p
      ..r = v()
      ..g = v()
      ..b = v();
  }
  return Uint8List.fromList(img.encodeJpg(i, quality: calidad));
}
