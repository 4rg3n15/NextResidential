/// «Cambiar servidor», alcanzable desde TODA pantalla de error de conexión.
///
/// El cliente lo pidió así: en sitio la app tiene que funcionar igual que en
/// casa. Cuando no llega al servidor, la salida tiene que estar AHÍ, junto a
/// «Reintentar», y no escondida en un ajuste que nadie encuentra con el
/// visitante esperando en la portería.
///
/// Por eso no se pasa como parámetro pantalla por pantalla —la duodécima se
/// olvidaría—: el armazón pone `ServidorDeLaApp` por encima de la navegación y
/// cualquier aviso de error lo encuentra en su contexto. Sin él (una prueba de
/// una pantalla suelta) el botón no se pinta.
library;

import 'package:flutter/material.dart';

import '../../aplicacion/servidor_en_uso.dart';
import '../../dominio/puertos.dart';
import '../pantallas/servidor.dart';

class ServidorDeLaApp extends InheritedNotifier<DireccionDelServidor> {
  ServidorDeLaApp({super.key, required this.cambio, required super.child})
    : super(notifier: cambio.direccion);

  final CambioDeServidor cambio;

  /// Suscribe a quien pregunta: si cambia la dirección, se vuelve a pintar.
  static CambioDeServidor? de(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ServidorDeLaApp>()?.cambio;
}

/// Los fallos ante los que cambiar de servidor puede ser la salida: no llegar,
/// o llegar a algo que contesta mal. Ante un 401 o un 403 no lo es.
bool esFalloDeConexion(Fallo f) =>
    f.clase == ClaseDeFallo.sinConexion || f.clase == ClaseDeFallo.servidor;

/// Abre la pantalla del servidor. Devuelve `true` si se cambió.
Future<bool> abrirServidor(BuildContext context, CambioDeServidor cambio) async {
  final cambiado = await Navigator.of(context).push<bool>(
    MaterialPageRoute(builder: (_) => PantallaDelServidor(cambio: cambio)),
  );
  return cambiado ?? false;
}

class BotonCambiarServidor extends StatelessWidget {
  const BotonCambiarServidor({super.key, this.alCambiar});

  /// Tras un cambio guardado, por si la pantalla tiene que olvidar su error.
  final VoidCallback? alCambiar;

  @override
  Widget build(BuildContext context) {
    final cambio = ServidorDeLaApp.de(context);
    if (cambio == null) return const SizedBox.shrink();
    return OutlinedButton.icon(
      key: const Key('cambiar-servidor'),
      onPressed: () async {
        if (await abrirServidor(context, cambio)) alCambiar?.call();
      },
      icon: const Icon(Icons.dns_outlined, size: 18),
      label: const Text('Cambiar servidor'),
    );
  }
}
