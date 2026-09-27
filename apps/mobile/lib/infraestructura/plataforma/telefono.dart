/// El puerto que toca el marcador del sistema operativo (ETAPA 15-I, D7).
///
/// Es el único sitio de la app que conoce `url_launcher`. Las pantallas reciben
/// el puerto; así se prueban con un doble que cuenta llamadas, sin plataforma.
library;

import 'package:url_launcher/url_launcher.dart';

import '../../dominio/hogar.dart';

/// D7 · abre el marcador con `tel:`. No llama solo: el residente pulsa «llamar»
/// en su teléfono, que es lo que el sistema operativo exige y lo que se espera.
class LlamadorDelSistema implements LlamadorDeTelefono {
  const LlamadorDelSistema();

  @override
  Future<bool> llamar(String numero) async {
    final uri = Uri(scheme: 'tel', path: numero);
    try {
      return await launchUrl(uri);
    } catch (_) {
      // Una tableta sin telefonía lanza en vez de devolver `false`: para la
      // pantalla las dos cosas significan lo mismo, «este aparato no llama».
      return false;
    }
  }
}
