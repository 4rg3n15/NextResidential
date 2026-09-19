import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';

/// Pestaña que existe y todavía no hace nada, **diciéndolo**.
///
/// Es la misma decisión que la consola de guardia virtual tomó con el vídeo en
/// la ETAPA 10: un recuadro negro parecería una cámara caída, así que el
/// recuadro explica que el puente llega en la 15. Aquí igual — una pestaña que
/// no responde parecería una app rota; una que dice qué falta y cuándo llega es
/// información.
class PantallaPendiente extends StatelessWidget {
  const PantallaPendiente({
    super.key,
    required this.titulo,
    required this.pantalla,
    required this.detalle,
  });

  final String titulo;

  /// El identificador del mockup (`M-4`), para que se pueda cruzar con
  /// `docs/auditoria/03-mockups.md` sin adivinar.
  final String pantalla;
  final String detalle;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(titulo, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Paleta.avisoSuave.fondo,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.construction_outlined, color: Paleta.avisoSuave.texto, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'Pantalla $pantalla · en construcción',
                    style: TextStyle(
                      color: Paleta.avisoSuave.texto,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(detalle, style: TextStyle(color: Paleta.avisoSuave.texto, height: 1.4)),
            ],
          ),
        ),
      ],
    );
  }
}
