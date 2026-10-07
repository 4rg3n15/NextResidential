/// 15-X · la copia que el selector del sistema deja en el teléfono, y cuándo
/// se puede borrar sin tocar nada del residente.
///
/// `image_picker` no entrega la foto original: escribe una COPIA reducida en
/// la carpeta temporal de la app —`…/tmp/image_picker_….jpg` en iOS,
/// `…/cache/image_picker_….jpg` en Android— y la deja ahí. La foto ya viaja en
/// memoria, así que la copia sólo es un rostro más guardado en el aparato; la
/// minimización de la Ley 1581 pide no tenerlo. Se borra en cuanto se lee.
///
/// `[SUPUESTO]` S-15X-03 · esa copia es siempre de la app. Para no apoyarse
/// sólo en eso, se borra únicamente lo que tiene las DOS señas —el nombre del
/// selector y una carpeta temporal—; cualquier otra ruta se deja como está.
library;

export 'borrado_web.dart' if (dart.library.io) 'borrado_io.dart';

final _carpetaTemporal = RegExp(r'[/\\](tmp|cache|Caches)[/\\]', caseSensitive: false);
final _nombreDelSelector = RegExp(r'[/\\]image_picker[^/\\]*$');

/// ¿Es la copia que dejó el selector en la carpeta temporal de la app?
bool esCopiaDelSelector(String ruta) =>
    _carpetaTemporal.hasMatch(ruta) && _nombreDelSelector.hasMatch(ruta);
