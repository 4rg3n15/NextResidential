import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';

/// Piezas que se repiten en más de una pantalla. Están aquí y no copiadas
/// porque la copia número tres es la que se queda con el contraste viejo.

/// Distintivo. **Recibe una `Pareja`, no un color**: es la regla que la ETAPA
/// 09-B tuvo que aprender midiendo 2,537:1 en un botón verde con texto blanco.
class Distintivo extends StatelessWidget {
  const Distintivo({super.key, required this.texto, required this.pareja});
  final String texto;
  final Pareja pareja;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: pareja.fondo,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        texto,
        style: TextStyle(color: pareja.texto, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class AccesoRapido extends StatelessWidget {
  const AccesoRapido({
    super.key,
    required this.icono,
    required this.etiqueta,
    required this.alPulsar,
  });

  final IconData icono;
  final String etiqueta;

  /// `null` deshabilita. Quien lo pasa es quien conoce la regla —el servidor,
  /// a través de `puedeAutorizar`—, no este widget.
  final void Function()? alPulsar;

  @override
  Widget build(BuildContext context) {
    final habilitado = alPulsar != null;
    return Semantics(
      button: true,
      enabled: habilitado,
      label: etiqueta,
      child: Card(
        child: InkWell(
          onTap: alPulsar,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Icon(
                  icono,
                  size: 22,
                  color: habilitado ? Paleta.marca : Paleta.textoSuave,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    etiqueta,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: habilitado ? null : Paleta.textoSuave,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Marca de dato servido de caché. Un dato viejo presentado como fresco es peor
/// que ningún dato, y en móvil ocurre siempre: la app se abre sin red.
class MarcaDeCache extends StatelessWidget {
  const MarcaDeCache({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Paleta.neutroSuave.fondo,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.history_toggle_off, size: 16, color: Paleta.neutroSuave.texto),
          const SizedBox(width: 6),
          Text(
            'Mostrando lo último que se pudo cargar',
            style: TextStyle(color: Paleta.neutroSuave.texto, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class EsqueletoCorto extends StatelessWidget {
  const EsqueletoCorto({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        2,
        (_) => Container(
          height: 64,
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Paleta.borde),
          ),
        ),
      ),
    );
  }
}

/// Fecha y hora en la zona del dispositivo, en formato corto y legible.
///
/// Sin `intl` con locale fijo: el residente ve la hora como su teléfono la
/// muestra. Forzar un formato colombiano en un teléfono configurado en otro
/// idioma es una decisión que nadie pidió.
String momentoLegible(DateTime cuando) {
  final local = cuando.toLocal();
  final dd = local.day.toString().padLeft(2, '0');
  final mm = local.month.toString().padLeft(2, '0');
  final hh = local.hour.toString().padLeft(2, '0');
  final min = local.minute.toString().padLeft(2, '0');
  return '$dd/$mm · $hh:$min';
}
