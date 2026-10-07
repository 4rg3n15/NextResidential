/// «Compartir» un código de plaza o de traspaso (RONDA 15-W).
///
/// La app no lleva un complemento de la hoja de compartir del sistema, y no se
/// añaden dependencias por esto: el mensaje completo —qué hacer y el código—
/// va al PORTAPAPELES, y la app lo DICE para que el residente sepa que tiene
/// que pegarlo en el mensaje que quiera. Un botón que dijera «compartido» sin
/// haber abierto nada sería una promesa falsa.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../dominio/plazas.dart';

Future<void> compartirCodigo(BuildContext context, String codigo) async {
  final mensajero = ScaffoldMessenger.of(context);
  await Clipboard.setData(ClipboardData(text: mensajeParaCompartir(codigo)));
  mensajero.showSnackBar(
    const SnackBar(
      content: Text(
        'Mensaje con el código copiado. Péguelo en un chat o en un mensaje de texto para '
        'quien vive con usted.',
      ),
    ),
  );
}

/// El botón, igual en todas partes.
class BotonCompartir extends StatelessWidget {
  const BotonCompartir({super.key, required this.codigo});
  final String codigo;

  @override
  Widget build(BuildContext context) => TextButton.icon(
    onPressed: () => compartirCodigo(context, codigo),
    icon: const Icon(Icons.ios_share, size: 18),
    label: const Text('Compartir'),
  );
}
