/// La galería del teléfono por el MISMO camino que la cámara (corrección de la
/// 15-L para la visita de sitio).
///
/// Lo que se prueba no es que `image_picker` abra la fototeca —eso es del
/// sistema—, sino lo que es nuestro: que la galería pide al selector con los
/// mismos parámetros que la cámara, que lo que devuelve termina en la misma
/// reducción (≤ 640 px, ≤ 180 KB) y en el mismo juicio de calidad del dominio,
/// y que cada forma de no llegar —cancelar, un archivo ilegible, un permiso
/// negado— sale con su motivo tipado y nunca como un error del paquete.
library;

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:ncr_residente/dominio/calidad_de_captura.dart';
import 'package:ncr_residente/dominio/medidas_de_imagen.dart';
import 'package:ncr_residente/dominio/origen_de_la_foto.dart';
import 'package:ncr_residente/infraestructura/camara/camara_del_telefono.dart';

import '../dobles/fotos.dart';

/// Lo que se le pidió al selector, parámetro por parámetro.
typedef Pedido = (ImageSource, double?, double?, int?, bool);

/// Un selector que no abre nada: devuelve lo que la prueba le da y apunta lo
/// que se le pidió.
class SelectorFalso extends ImagePicker {
  SelectorFalso(this._respuesta);
  final Future<XFile?> Function() _respuesta;
  final pedidos = <Pedido>[];

  @override
  Future<XFile?> pickImage({
    required ImageSource source,
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    bool requestFullMetadata = true,
  }) {
    pedidos.add((source, maxWidth, maxHeight, imageQuality, requestFullMetadata));
    return _respuesta();
  }
}

CamaraDelTelefono conArchivo(Uint8List bytes) =>
    CamaraDelTelefono(selector: SelectorFalso(() async => XFile.fromData(bytes)));

/// El juicio que hará la pantalla, con el encuadre ya confirmado: así se
/// comparan la luz y la nitidez, que son lo que sale de los píxeles.
List<FalloDeCalidad> juicio(MedidasDeCaptura m) => evaluarCaptura(conEncuadreConfirmado(m));

void main() {
  test('la galería pide al selector con los MISMOS parámetros que la cámara', () async {
    final selector = SelectorFalso(() async => null);
    final camara = CamaraDelTelefono(selector: selector);
    await camara.tomar(OrigenDeFoto.camara);
    await camara.tomar(OrigenDeFoto.galeria);

    final (fuenteCamara, anchoC, altoC, calidadC, metadatosC) = selector.pedidos[0];
    final (fuenteGaleria, anchoG, altoG, calidadG, metadatosG) = selector.pedidos[1];
    expect(fuenteCamara, ImageSource.camera);
    expect(fuenteGaleria, ImageSource.gallery);
    expect([anchoG, altoG, calidadG], [anchoC, altoC, calidadC]);
    expect(anchoG, ladoMaximo.toDouble());
    expect(calidadG, calidadDelSelector);
    // Sin metadatos completos: en iOS antiguos es lo que pediría permiso de
    // fototeca, y la foto no los necesita.
    expect([metadatosC, metadatosG], [false, false]);
  });

  test('una foto GRANDE de la galería termina en ≤ 640 px y ≤ 180 KB, como la de la cámara',
      () async {
    // El peor caso: el sistema no la redujo y llega entera.
    final grande = jpegDeFoto(3000, 2000);
    final deGaleria = (await conArchivo(grande).tomar(OrigenDeFoto.galeria))!;
    final deCamara = (await conArchivo(grande).tomar(OrigenDeFoto.camara))!;

    final enviada = img.decodeJpg(deGaleria.jpeg)!;
    expect(enviada.width, lessThanOrEqualTo(ladoMaximo));
    expect(enviada.height, lessThanOrEqualTo(ladoMaximo));
    expect(deGaleria.jpeg.length, lessThanOrEqualTo(bytesMaximos));
    // El mismo camino: los mismos bytes y las mismas medidas que viajarán.
    expect(deGaleria.jpeg, deCamara.jpeg);
    expect(deGaleria.medidas.nitidez, deCamara.medidas.nitidez);
    expect(deGaleria.medidas.iluminacion, deCamara.medidas.iluminacion);
    expect(deGaleria.sinDetector, isTrue);
  });

  test('una foto oscura y movida de la galería se rechaza con los MISMOS motivos', () async {
    final oscura = img.Image(width: 900, height: 700)..clear(img.ColorRgb8(12, 12, 12));
    final bytes = Uint8List.fromList(img.encodeJpg(oscura, quality: 90));
    final deGaleria = (await conArchivo(bytes).tomar(OrigenDeFoto.galeria))!;
    final deCamara = (await conArchivo(bytes).tomar(OrigenDeFoto.camara))!;

    expect(juicio(deGaleria.medidas), [FalloDeCalidad.borrosa, FalloDeCalidad.oscura]);
    expect(juicio(deGaleria.medidas), juicio(deCamara.medidas));
  });

  test('cancelar la galería no es un fallo: no hay foto y nada se lanza', () async {
    final camara = CamaraDelTelefono(selector: SelectorFalso(() async => null));
    expect(await camara.tomar(OrigenDeFoto.galeria), isNull);
  });

  test('un archivo que no es una imagen (un HEIC sin convertir) es «ilegible»', () async {
    final camara = conArchivo(Uint8List.fromList(List<int>.filled(64, 7)));
    await expectLater(
      camara.tomar(OrigenDeFoto.galeria),
      throwsA(isA<FotoNoObtenida>().having((f) => f.motivo, 'motivo', MotivoSinFoto.ilegible)),
    );
  });

  test('un archivo que no se puede leer (iCloud sin bajar) es «ilegible»', () async {
    final camara = CamaraDelTelefono(
      selector: SelectorFalso(() async => XFile('/ruta/que/no/existe/foto.heic')),
    );
    await expectLater(
      camara.tomar(OrigenDeFoto.galeria),
      throwsA(isA<FotoNoObtenida>().having((f) => f.motivo, 'motivo', MotivoSinFoto.ilegible)),
    );
  });

  test('un permiso negado por el sistema llega tipado, no como PlatformException', () async {
    final camara = CamaraDelTelefono(
      selector: SelectorFalso(() async => throw PlatformException(code: 'photo_access_denied')),
    );
    await expectLater(
      camara.tomar(OrigenDeFoto.galeria),
      throwsA(isA<FotoNoObtenida>().having((f) => f.motivo, 'motivo', MotivoSinFoto.sinPermiso)),
    );
  });

  test('los códigos del selector, traducidos: nunca un permiso inventado', () {
    expect(motivoDelSelector('photo_access_denied'), MotivoSinFoto.sinPermiso);
    expect(motivoDelSelector('photo_access_restricted'), MotivoSinFoto.sinPermiso);
    expect(motivoDelSelector('camera_access_denied'), MotivoSinFoto.sinPermiso);
    expect(motivoDelSelector('invalid_image'), MotivoSinFoto.ilegible);
    expect(motivoDelSelector('no_valid_image_uri'), MotivoSinFoto.ilegible);
    expect(motivoDelSelector('multiple_request'), MotivoSinFoto.noSeAbrio);
    expect(motivoDelSelector('no_available_camera'), MotivoSinFoto.noSeAbrio);
  });

  group('lo que la foto NO lleva: sus metadatos', () {
    /// Una foto pequeña, como la que entrega el selector, con la ubicación y
    /// la orientación que suele traer una foto de galería.
    Uint8List conUbicacion() {
      final i = jpegDeFoto(300, 200, calidad: 80);
      final foto = img.decodeJpg(i)!;
      foto.exif.gpsIfd.setGpsLocation(latitude: 4.6097, longitude: -74.0817);
      foto.exif.imageIfd.orientation = 6;
      return Uint8List.fromList(img.encodeJpg(foto, quality: 80));
    }

    test('la ubicación no sale del teléfono, aunque la foto ya cupiera', () async {
      final original = conUbicacion();
      expect(img.decodeJpg(original)!.exif.gpsIfd.gpsLatitude, isNotNull);

      final foto = (await conArchivo(original).tomar(OrigenDeFoto.galeria))!;
      final enviada = img.decodeJpg(foto.jpeg)!;
      expect(enviada.exif.isEmpty, isTrue);
      expect(sinMetadatos(foto.jpeg), isTrue);
      // La orientación se aplicó a los píxeles antes de descartarla.
      expect((enviada.width, enviada.height), (200, 300));
    });

    test('sinMetadatos lee la cabecera: con EXIF, no; sin él, sí; rara, no', () {
      expect(sinMetadatos(conUbicacion()), isFalse);
      expect(sinMetadatos(jpegDeFoto(32, 32)), isTrue);
      expect(sinMetadatos(Uint8List.fromList([0xFF, 0xD8, 0x00, 0x00, 0x00])), isFalse);
    });
  });
}
