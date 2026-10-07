/// 15-X · la copia que el selector deja en la carpeta temporal se borra al
/// leerla; nada que no tenga sus dos señas se toca.
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:ncr_residente/dominio/origen_de_la_foto.dart';
import 'package:ncr_residente/infraestructura/camara/camara_del_telefono.dart';
import 'package:ncr_residente/infraestructura/camara/copia_temporal.dart';

import '../dobles/fotos.dart';

class SelectorDeArchivo extends ImagePicker {
  SelectorDeArchivo(this.ruta);
  final String ruta;

  @override
  Future<XFile?> pickImage({
    required ImageSource source,
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    bool requestFullMetadata = true,
  }) async => XFile(ruta);
}

void main() {
  test('las dos señas: el nombre del selector y una carpeta temporal', () {
    expect(esCopiaDelSelector('/data/user/0/app/cache/image_picker_123.jpg'), isTrue);
    expect(
      esCopiaDelSelector(
        '/private/var/mobile/Containers/Data/Application/X/tmp/image_picker_A.jpg',
      ),
      isTrue,
    );
    // Sin una de las dos, no se toca.
    expect(esCopiaDelSelector('/storage/emulated/0/DCIM/Camera/image_picker_1.jpg'), isFalse);
    expect(esCopiaDelSelector('/data/user/0/app/cache/IMG_0001.jpg'), isFalse);
    expect(esCopiaDelSelector(''), isFalse);
  });

  group('la cámara borra la copia al leerla', () {
    late Directory raiz;
    setUp(() async => raiz = await Directory.systemTemp.createTemp('ncr-copia-'));
    tearDown(() async => raiz.delete(recursive: true));

    Future<File> escribir(String relativa) async {
      final f = File('${raiz.path}/$relativa');
      await f.parent.create(recursive: true);
      return f.writeAsBytes(jpegDeFoto(64, 48));
    }

    test('la copia del selector ya no está, y la foto viaja igual', () async {
      final copia = await escribir('cache/image_picker_7.jpg');
      final foto = await CamaraDelTelefono(selector: SelectorDeArchivo(copia.path))
          .tomar(OrigenDeFoto.camara);
      expect(foto, isNotNull);
      expect(await copia.exists(), isFalse);
    });

    test('un archivo que no es la copia del selector se queda donde está', () async {
      final ajeno = await escribir('DCIM/IMG_0001.jpg');
      await CamaraDelTelefono(selector: SelectorDeArchivo(ajeno.path)).tomar(OrigenDeFoto.galeria);
      expect(await ajeno.exists(), isTrue);
    });
  });
}
