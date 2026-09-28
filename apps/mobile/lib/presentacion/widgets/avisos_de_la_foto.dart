/// Las piezas que pinta `FotoDelVisitante`: los consejos para repetirla, las
/// notas de «sirve» o «no se pudo», y los botones de cada origen.
///
/// Salieron del widget de la foto cuando llegó la galería: con dos botones y
/// sus avisos, el fichero dejaba de caber en una lectura. No deciden nada;
/// pintan lo que el estado de la foto les da.
library;

import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/calidad_de_captura.dart';

class ConsejosDeLaFoto extends StatelessWidget {
  const ConsejosDeLaFoto({super.key, required this.fallos});
  final List<FalloDeCalidad> fallos;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Paleta.avisoSuave.fondo,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            fallos.length == 1 ? 'Repita la foto' : 'Repita la foto: hay ${fallos.length} cosas',
            style: TextStyle(color: Paleta.avisoSuave.texto, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          // Todos los consejos a la vez. Uno por uno serían tres viajes.
          ...fallos.map(
            (f) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                '· ${consejoPara(f)}',
                style: TextStyle(color: Paleta.avisoSuave.texto, fontSize: 13),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class NotaDeLaFoto extends StatelessWidget {
  const NotaDeLaFoto({super.key, required this.icono, required this.pareja, required this.texto});
  final IconData icono;
  final Pareja pareja;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: pareja.fondo, borderRadius: BorderRadius.circular(10)),
        child: Row(
          children: [
            Icon(icono, color: pareja.texto, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(texto, style: TextStyle(color: pareja.texto, fontSize: 13)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Un botón por origen, a lo ancho y de 48 de alto: se pulsa con el pulgar
/// mientras la otra mano sostiene el documento del visitante. Mientras su
/// selector está abierto enseña que trabaja, en vez de un botón quieto.
class BotonDeLaFoto extends StatelessWidget {
  const BotonDeLaFoto({
    super.key,
    required this.icono,
    required this.texto,
    required this.ocupado,
    required this.alPulsar,
  });

  final IconData icono;
  final String texto;
  final bool ocupado;

  /// `null` = deshabilitado (enviando, u otro selector abierto).
  final VoidCallback? alPulsar;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: alPulsar,
      icon: ocupado
          ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : Icon(icono),
      label: Text(texto),
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
    );
  }
}
