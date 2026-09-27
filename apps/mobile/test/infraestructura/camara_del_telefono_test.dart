import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:ncr_residente/infraestructura/camara/camara_del_telefono.dart';

/// La parte comprobable sin cámara: de un JPEG grande a lo que viaja.
/// Un degradado con algo de ruido: se parece más a una foto que el ruido puro,
/// que ningún JPEG comprime y no representa lo que entrega una cámara.
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

void main() {
  test('una foto grande se reduce a 640 px y cabe en 180 KB (minimización)', () {
    final foto = fotoDesdeJpeg(jpegDeFoto(1600, 1200))!;
    final enviada = img.decodeJpg(foto.jpeg)!;
    expect(enviada.width, ladoMaximo);
    expect(enviada.height, 480);
    expect(foto.jpeg.length, lessThanOrEqualTo(bytesMaximos));
    // Sin detector: el conteo no se inventa, lo confirma quien captura.
    expect(foto.sinDetector, isTrue);
    expect(foto.medidas.rostrosDetectados, 0);
    expect(foto.medidas.nitidez, greaterThan(0));
  });

  test('una foto ya pequeña y liviana viaja tal cual', () {
    final original = jpegDeFoto(320, 240, calidad: 70);
    final foto = fotoDesdeJpeg(original)!;
    expect(foto.jpeg, same(original));
  });

  test('ruido puro que no cabe ni reducido: se reduce el lado hasta caber o no hay foto', () {
    final foto = fotoDesdeJpeg(jpegDeFoto(1600, 1200, ruido: 255));
    if (foto != null) expect(foto.jpeg.length, lessThanOrEqualTo(bytesMaximos));
  });

  test('bytes que no son una imagen: no hay foto', () {
    expect(fotoDesdeJpeg(Uint8List.fromList([1, 2, 3, 4])), isNull);
  });

  test('un PNG pequeño NO viaja tal cual: se recomprime como JPEG', () {
    // El contrato promete `image/jpeg` y el servidor comprueba el tipo REAL.
    // Un PNG que cupiera en el techo y pasara sin tocar sería rechazado allí
    // como «el archivo no es la imagen que dice ser».
    final png = Uint8List.fromList(img.encodePng(img.Image(width: 40, height: 30)));
    expect(esJpeg(png), isFalse);
    final foto = fotoDesdeJpeg(png)!;
    expect(esJpeg(foto.jpeg), isTrue);
    expect(img.decodeJpg(foto.jpeg)!.width, 40);
  });

  test('esJpeg mira la cabecera, no la extensión', () {
    expect(esJpeg(jpegDeFoto(16, 16)), isTrue);
    expect(esJpeg(Uint8List.fromList([0xFF, 0xD8])), isFalse, reason: 'demasiado corto');
    expect(esJpeg(Uint8List.fromList([0x89, 0x50, 0x4E, 0x47, 0x0D])), isFalse);
  });
}
