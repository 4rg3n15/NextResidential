/// H-SITIO-11 · EL PORQUÉ DE UN FALLO DE RED, SÓLO EN COMPILACIÓN DEBUG.
///
/// En sitio, el 26/09/2026, un iPhone físico decía «No hay conexión con el
/// servidor» mientras Safari, en el mismo teléfono, abría `/health`. Con sólo
/// esa frase no se distingue una URL mal compilada, un permiso de red local
/// denegado y un servidor caído: las tres dan el mismo aviso. Este panel
/// enseña la URL base compilada, el tipo de excepción y su mensaje.
///
/// Nunca en Release: `mostrar` vale `kDebugMode` por omisión, y la
/// infraestructura ya tachó cualquier cosa con forma de token.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/puertos.dart';

class DetalleDeFallo extends StatelessWidget {
  const DetalleDeFallo({super.key, required this.fallo, this.mostrar = kDebugMode});

  final Fallo fallo;

  /// Inyectable para probar que en Release NO aparece.
  final bool mostrar;

  @override
  Widget build(BuildContext context) {
    final detalle = fallo.detalleTecnico;
    if (!mostrar || detalle == null || detalle.isEmpty) return const SizedBox.shrink();
    // Sin bordes: el panel vive dentro del aviso y no debe partirlo en dos.
    return ExpansionTile(
      key: const Key('detalle-de-fallo'),
      tilePadding: EdgeInsets.zero,
      shape: const Border(),
      collapsedShape: const Border(),
      title: Text(
        'Detalle técnico (sólo en Debug)',
        style: TextStyle(color: Paleta.peligroSuave.texto, fontSize: 13),
      ),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SelectableText(
            detalle,
            style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
          ),
        ),
      ],
    );
  }
}
