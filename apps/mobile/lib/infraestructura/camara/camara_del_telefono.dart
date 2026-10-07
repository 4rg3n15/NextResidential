/// La cámara REAL del teléfono, y su galería (15-I, hito 3 del reto: «foto
/// desde la app → sincronizar la terminal → reconocer»; la galería, corrección
/// de la 15-L para la visita de sitio).
///
/// ─────────────────────────────────────────────────────────────────────────────
/// LO QUE VIAJA ES UN JPEG, Y SOLO UN JPEG
///
/// La terminal facial construye su plantilla a partir de una IMAGEN, igual que
/// en la consola (`apps/web/src/lib/biometria/imagen.ts`), y el contrato de la
/// visita declara `image/jpeg`. El servidor comprueba que el contenido sea de
/// verdad lo que dice el tipo, así que aquí se garantiza: lo que no llegue
/// como JPEG —un PNG, una captura de pantalla— se recomprime, y lo que no se
/// pueda descodificar —un HEIC que el sistema no convirtió— se dice.
/// Lo que el sistema guarda no es legible —entra cifrado y ninguna ruta lo
/// devuelve— y en el teléfono no queda nada: la foto vive en memoria mientras
/// el formulario está abierto, y la copia que el selector escribió en la
/// carpeta temporal se borra en cuanto se lee (15-X, `copia_temporal.dart`).
///
/// Minimización (Ley 1581, art. 4): el selector del sistema entrega la foto ya
/// reducida a 640 px de lado; si aun así pasa de 180 KB, se recomprime aquí.
/// La foto original de doce megapíxeles nunca sale del aparato, y tampoco sus
/// metadatos: una foto de la galería suele llevar en su EXIF dónde y cuándo se
/// tomó, y eso no le hace falta a ninguna terminal.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// LA CÁMARA Y LA GALERÍA, POR EL MISMO CAMINO
///
/// Las dos piden al MISMO selector con los MISMOS parámetros y terminan en la
/// MISMA `fotoDesdeJpeg`: lado, techo, recompresión y medidas no saben de
/// dónde vino la foto. El servidor vuelve a juzgar con esas medidas, y dos
/// formas de calcularlas serían dos verdades.
///
/// En iOS 14 o posterior (la app exige 15) la galería es PHPicker: corre FUERA
/// del proceso de la app y le entrega sólo la foto elegida, así que NO pide
/// permiso de fototeca, tampoco con el acceso limitado de iOS 14. Además se
/// pide sin metadatos completos (`requestFullMetadata: false`), que es lo que
/// en un iOS antiguo haría saltar ese permiso. `NSPhotoLibraryUsageDescription`
/// sigue declarada en el Info.plist porque el paquete la exige. En Android el
/// selector del sistema tampoco pide permiso de almacenamiento.
/// ─────────────────────────────────────────────────────────────────────────────
library;

import 'package:flutter/services.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';

import '../../dominio/medidas_de_imagen.dart';
import '../../dominio/origen_de_la_foto.dart';
import '../../dominio/puertos.dart';
import 'copia_temporal.dart';

/// Lado mayor de lo que se envía, y techo del JPEG. Los de la consola.
const ladoMaximo = 640;
const bytesMaximos = 180 * 1024;

/// La calidad con que el selector del sistema recomprime. Una para los dos
/// orígenes, por lo mismo que el lado.
const calidadDelSelector = 82;

class CamaraDelTelefono {
  CamaraDelTelefono({ImagePicker? selector}) : _selector = selector ?? ImagePicker();
  final ImagePicker _selector;

  /// `null` = el residente canceló. Un archivo ilegible, un permiso negado o
  /// un selector que no abre llegan como `FotoNoObtenida`, nunca como un
  /// error del paquete: la pantalla no sabe qué es un `PlatformException`.
  Future<FotoTomada?> tomar(OrigenDeFoto origen) async {
    final archivo = await _elegir(origen);
    if (archivo == null) return null;
    final Uint8List bytes;
    try {
      bytes = await archivo.readAsBytes();
    } on Exception {
      throw const FotoNoObtenida(MotivoSinFoto.ilegible);
    } finally {
      // 15-X · la copia que dejó el selector no se queda en el teléfono.
      await borrarCopiaDelSelector(archivo.path);
    }
    // Lo que no se descodifica (un HEIC que el sistema no convirtió, algo
    // que no es una imagen) se dice; callarlo parecería una cancelación.
    return fotoDesdeJpeg(bytes) ?? (throw const FotoNoObtenida(MotivoSinFoto.ilegible));
  }

  Future<XFile?> _elegir(OrigenDeFoto origen) async {
    try {
      return await _selector.pickImage(
        source: switch (origen) {
          OrigenDeFoto.camara => ImageSource.camera,
          OrigenDeFoto.galeria => ImageSource.gallery,
        },
        preferredCameraDevice: CameraDevice.rear,
        maxWidth: ladoMaximo.toDouble(),
        maxHeight: ladoMaximo.toDouble(),
        imageQuality: calidadDelSelector,
        requestFullMetadata: false,
      );
    } on PlatformException catch (e) {
      throw FotoNoObtenida(motivoDelSelector(e.code));
    }
  }
}

/// Los códigos de `image_picker` (iOS y Android), traducidos al motivo del
/// dominio. Lo que no se reconoce es «no se abrió»: nunca un permiso inventado.
MotivoSinFoto motivoDelSelector(String codigo) {
  if (codigo.endsWith('_access_denied') || codigo.endsWith('_access_restricted')) {
    return MotivoSinFoto.sinPermiso;
  }
  const ilegibles = {'invalid_image', 'invalid_source', 'no_valid_image_uri'};
  return ilegibles.contains(codigo) ? MotivoSinFoto.ilegible : MotivoSinFoto.noSeAbrio;
}

/// Descodifica, reduce si hace falta, recomprime hasta el techo y mide. Es la
/// parte comprobable sin cámara: la prueba le pasa un JPEG fabricado.
///
/// Sólo viaja tal cual lo que YA es un JPEG pequeño y sin metadatos; cualquier
/// otra cosa se recomprime, aunque quepa, porque el contrato promete
/// `image/jpeg` y la foto no lleva más que la foto.
///
/// `null` si los bytes no son una imagen o si ni reducida cabe en el techo:
/// para la pantalla es «no se pudo leer», y el residente repite o elige otra.
FotoTomada? fotoDesdeJpeg(Uint8List bytes) {
  final img.Image? leida;
  try {
    leida = img.decodeImage(bytes);
  } catch (_) {
    return null;
  }
  if (leida == null) return null;
  if (esJpeg(bytes) &&
      sinMetadatos(bytes) &&
      _ladoMayor(leida) <= ladoMaximo &&
      bytes.length <= bytesMaximos) {
    return _medida(bytes, leida);
  }
  // [SUPUESTO] S-97 · Ni la terminal ni el servidor necesitan el EXIF, así que se
  // descarta entero: ubicación, aparato y fecha no salen del teléfono. La
  // orientación se aplica antes a los píxeles, para que la terminal no reciba
  // de lado lo que el residente vio derecho.
  final original = img.bakeOrientation(leida)..exif = img.ExifData();
  final mayor = _ladoMayor(original);
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

/// Los tres primeros bytes de todo JPEG (SOI + el primer marcador). Es la misma
/// comprobación de «tipo real» que hace el servidor, hecha antes de enviar.
bool esJpeg(Uint8List bytes) =>
    bytes.length > 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF;

/// Si la cabecera del JPEG llega hasta los píxeles (SOS) sin un segmento de
/// metadatos: APP1 (EXIF, XMP) ni APP13 (IPTC). Una cabecera que no se sabe
/// recorrer cuenta como «con metadatos»: recomprimir nunca filtra nada.
bool sinMetadatos(Uint8List jpeg) {
  var i = 2;
  while (i + 3 < jpeg.length && jpeg[i] == 0xFF) {
    final marcador = jpeg[i + 1];
    if (marcador == 0xDA) return true;
    if (marcador == 0xE1 || marcador == 0xED) return false;
    i += 2 + (jpeg[i + 2] << 8 | jpeg[i + 3]);
  }
  return false;
}

int _ladoMayor(img.Image i) => i.width > i.height ? i.width : i.height;

img.Image _reducir(img.Image i, int lado) => i.width >= i.height
    ? img.copyResize(i, width: lado)
    : img.copyResize(i, height: lado);

FotoTomada _medida(Uint8List jpeg, img.Image imagen) {
  final rgba = imagen.convert(numChannels: 4).getBytes(order: img.ChannelOrder.rgba);
  return FotoTomada(
    jpeg: jpeg,
    medidas: medidasSinDetector(rgba, imagen.width, imagen.height),
    vistaPrevia: jpeg,
    sinDetector: true,
  );
}
