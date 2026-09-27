/// De dónde sale la foto del visitante, y por qué a veces no llega
/// (corrección de la 15-L para la visita de sitio: «Elegir de la galería»).
///
/// ═════════════════════════════════════════════════════════════════════════════
/// DOS ORÍGENES, UN SOLO CAMINO
///
/// El residente puede tomar la foto en ese momento o elegir una que ya tiene
/// —la que el visitante le mandó por mensaje, por ejemplo—. El origen cambia
/// SÓLO quién entrega los bytes: la reducción (lado 640, techo de 180 KB), la
/// medida de nitidez e iluminación y el juicio de calidad son los mismos para
/// las dos. Si la galería tuviera su propio camino, el servidor —que vuelve a
/// juzgar con las medidas que la app envía— recibiría medidas calculadas de
/// dos formas, y «sirve con la cámara y no con la galería» no lo sabría
/// explicar nadie.
///
/// Por eso el origen es un ARGUMENTO del puerto y no un segundo puerto: dos
/// puertos invitarían a una segunda copia de la reducción.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// CANCELAR NO ES UN FALLO
///
/// Quien abre la galería y se arrepiente no ha hecho nada mal: el puerto
/// devuelve `null` y la pantalla deja todo como estaba. Lo que SÍ es un fallo
/// —un archivo que no se puede leer, un permiso negado— llega tipado, con su
/// motivo, para que la pantalla diga qué hacer en vez de quedarse muda.
library;

/// De dónde sale la foto.
enum OrigenDeFoto { camara, galeria }

/// Por qué no llegó una foto que el residente sí pidió.
enum MotivoSinFoto {
  /// El archivo no se pudo leer o no es una imagen: una foto de iCloud que no
  /// terminó de bajar, un HEIC que el teléfono no convirtió, un documento.
  ilegible,

  /// El sistema negó el permiso (cámara; fotos en Android o en iOS antiguos).
  sinPermiso,

  /// No se pudo abrir el selector por otra causa: la cámara ocupada, otro
  /// selector ya abierto.
  noSeAbrio,
}

/// El fallo tipado que lanza la fuente de fotos. Implementa `Exception` por
/// lo mismo que `Fallo`: la pantalla lo atrapa por su tipo, no por su texto.
class FotoNoObtenida implements Exception {
  const FotoNoObtenida(this.motivo);
  final MotivoSinFoto motivo;

  @override
  String toString() => 'FotoNoObtenida(${motivo.name})';
}

/// Qué le decimos al residente, en palabras y con la salida. Vive con el
/// motivo, como `consejoPara` vive con los fallos de calidad: repartido por la
/// pantalla, cada botón acabaría diciendo una cosa distinta del mismo fallo.
///
/// El permiso se explica sin nombrar la app por su nombre del sistema, que no
/// es el mismo en iPhone y en Android: «busque esta app» sirve en los dos.
String avisoSinFoto(MotivoSinFoto motivo, OrigenDeFoto origen) {
  final camara = origen == OrigenDeFoto.camara;
  switch (motivo) {
    case MotivoSinFoto.ilegible:
      return camara
          ? 'No se pudo leer la foto que tomó la cámara. Tómela de nuevo.'
          : 'No se pudo leer esa imagen: puede que no sea una foto o que todavía no se '
              'haya descargado de la nube. Elija otra o tómela con la cámara.';
    case MotivoSinFoto.sinPermiso:
      return camara
          ? 'La app no tiene permiso para usar la cámara. Actívelo en los Ajustes del '
              'teléfono: busque esta app y active «Cámara» en sus permisos.'
          : 'La app no tiene permiso para ver sus fotos. Actívelo en los Ajustes del '
              'teléfono: busque esta app y active «Fotos» en sus permisos.';
    case MotivoSinFoto.noSeAbrio:
      return camara
          ? 'No se pudo abrir la cámara. Revise que la app tenga permiso para usarla.'
          : 'No se pudo abrir la galería. Inténtelo de nuevo o tome la foto con la cámara.';
  }
}
