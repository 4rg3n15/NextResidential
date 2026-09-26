/// La cámara REAL del teléfono (15-I, hito 3 del reto: «foto desde la app →
/// sincronizar la terminal → reconocer»).
///
/// ─────────────────────────────────────────────────────────────────────────────
/// LO QUE VIAJA ES UN JPEG, Y SE DICE
///
/// El campo del contrato se llama `vector`, pero la terminal facial de este
/// proyecto construye su plantilla a partir de una IMAGEN y no acepta un vector
/// ajeno: es lo mismo que ya hace la consola (`apps/web/src/lib/biometria/
/// imagen.ts`). Lo que el sistema guarda sigue sin ser legible —entra cifrado a
/// la bóveda y ninguna ruta lo devuelve— y en el teléfono no queda nada: la
/// foto vive en memoria mientras la pantalla está abierta.
///
/// Minimización (Ley 1581, art. 4): la cámara del sistema entrega la foto ya
/// reducida a 640 px de lado; si aun así pasa de 180 KB, se recomprime aquí.
/// La foto original de doce megapíxeles nunca sale del aparato.
/// ─────────────────────────────────────────────────────────────────────────────
library;

import 'dart:typed_data';

import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';

import '../../dominio/medidas_de_imagen.dart';
import '../../presentacion/pantallas/rostro_del_visitante.dart';

/// Lado mayor de lo que se envía, y techo del JPEG. Los de la consola.
const ladoMaximo = 640;
const bytesMaximos = 180 * 1024;

class CamaraDelTelefono {
  CamaraDelTelefono({ImagePicker? selector}) : _selector = selector ?? ImagePicker();
  final ImagePicker _selector;

  Future<FotoTomada?> tomar() async {
    final archivo = await _selector.pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.rear,
      maxWidth: ladoMaximo.toDouble(),
      maxHeight: ladoMaximo.toDouble(),
      imageQuality: 82,
    );
    if (archivo == null) return null;
    return fotoDesdeJpeg(await archivo.readAsBytes());
  }
}

/// Descodifica, reduce si hace falta, recomprime hasta el techo y mide. Es la
/// parte comprobable sin cámara: la prueba le pasa un JPEG fabricado.
///
/// `null` si los bytes no son una imagen o si ni reducida cabe en el techo:
/// para la pantalla es «no hay foto», y el residente repite.
FotoTomada? fotoDesdeJpeg(Uint8List bytes) {
  final img.Image? original;
  try {
    original = img.decodeImage(bytes);
  } catch (_) {
    return null;
  }
  if (original == null) return null;
  final mayor = original.width > original.height ? original.width : original.height;
  if (mayor <= ladoMaximo && bytes.length <= bytesMaximos) {
    return _medida(bytes, original);
  }
  // Primero el lado, después la calidad; si aun así no cabe, un lado menor.
  for (final lado in const [ladoMaximo, 480, 360]) {
    final reducida = mayor > lado ? _reducir(original, lado) : original;
    for (final calidad in const [82, 70, 60, 50]) {
      final jpeg = Uint8List.fromList(img.encodeJpg(reducida, quality: calidad));
      if (jpeg.length <= bytesMaximos) return _medida(jpeg, reducida);
    }
  }
  return null;
}

img.Image _reducir(img.Image i, int lado) => i.width >= i.height
    ? img.copyResize(i, width: lado)
    : img.copyResize(i, height: lado);

FotoTomada _medida(Uint8List jpeg, img.Image imagen) {
  final rgba = imagen.convert(numChannels: 4).getBytes(order: img.ChannelOrder.rgba);
  return FotoTomada(
    vector: jpeg,
    medidas: medidasSinDetector(rgba, imagen.width, imagen.height),
    vistaPrevia: jpeg,
    sinDetector: true,
  );
}
