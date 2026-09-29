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

String _dos(int n) => n.toString().padLeft(2, '0');

/// C5 (15-M) · LA ÚNICA fecha corta de la app: `DD-MM-YYYY`, en la hora del
/// teléfono. Toda pantalla que escriba una fecha pasa por aquí; el «dd/MM» y
/// el «dd/MM/yyyy» que convivían se leían distinto en dos pantallas seguidas.
String fechaCorta(DateTime cuando) {
  final l = cuando.toLocal();
  return '${_dos(l.day)}-${_dos(l.month)}-${l.year}';
}

/// `HH:MM` en la hora del teléfono, reloj de 24 horas.
String horaCorta(DateTime cuando) {
  final l = cuando.toLocal();
  return '${_dos(l.hour)}:${_dos(l.minute)}';
}

/// Fecha y hora en la zona del dispositivo: `DD-MM-YYYY · HH:MM`.
///
/// Sin `intl` con locale fijo para la hora: el residente ve la hora como su
/// teléfono la muestra. La fecha sí va siempre con año: una visita «del 28»
/// sin mes ni año no dice para cuándo es.
String momentoLegible(DateTime cuando) => '${fechaCorta(cuando)} · ${horaCorta(cuando)}';

/// C9 (15-M) · la confirmación de una placa cuando el servidor no la mandó
/// (listas guardadas antes del cambio): la misma frase, con las mismas fechas.
String confirmacionDePlaca({
  required String? placa,
  required String visitante,
  required DateTime desde,
  required DateTime hasta,
}) {
  final p = placa?.trim() ?? '';
  if (p.isEmpty) return '';
  final quien = visitante.trim().isEmpty ? 'el visitante' : visitante.trim();
  return 'Placa $p registrada para la visita de $quien, '
      'del ${fechaCorta(desde)} ${horaCorta(desde)} al ${fechaCorta(hasta)} ${horaCorta(hasta)}';
}
