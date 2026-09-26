/// Los dos puertos que tocan el sistema operativo (ETAPA 15-I, D7 y punto 5).
///
/// Son los únicos sitios de la app que conocen `url_launcher` y `share_plus`.
/// Las pantallas reciben el puerto; así se prueban con un doble que cuenta
/// llamadas, sin plataforma.
library;

import 'package:share_plus/share_plus.dart';
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

/// Punto 5 · el panel NATIVO de compartir (WhatsApp, SMS, correo del propio
/// residente…). No hay SMTP (D9): el enlace lo entrega el residente.
class CompartidorDelSistema implements Compartidor {
  const CompartidorDelSistema();

  @override
  Future<void> compartir(String texto) async {
    await Share.share(texto);
  }
}
