/// Lo que ve quien entra mientras el primer ingreso consulta o espera (3.2):
/// la consulta en curso o su fallo —con «Cambiar servidor» si no hubo red—, y
/// la cuenta que todavía no tiene vivienda asignada (15-W). Salió de
/// `primer_ingreso.dart` para que la puerta se lea de una vez.
library;

import 'package:flutter/material.dart';

import '../../dominio/puertos.dart';
import 'servidor.dart';

class ConsultandoElIngreso extends StatelessWidget {
  const ConsultandoElIngreso({
    super.key,
    required this.consultando,
    required this.fallo,
    required this.alReintentar,
    required this.alSalir,
  });

  final bool consultando;
  final Fallo? fallo;
  final Future<void> Function() alReintentar;
  final void Function() alSalir;

  @override
  Widget build(BuildContext context) {
    final f = fallo;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: f == null || consultando
                ? const CircularProgressIndicator()
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.cloud_off_outlined, size: 48),
                      const SizedBox(height: 12),
                      Text(f.detalle, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: alReintentar, child: const Text('Reintentar')),
                      // 15-L · sin servidor, la salida está aquí mismo.
                      if (esFalloDeConexion(f)) ...[
                        const SizedBox(height: 8),
                        const BotonCambiarServidor(),
                      ],
                      TextButton(onPressed: alSalir, child: const Text('Salir')),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

/// 15-W · la cuenta no trae vivienda: no hay nada que llenar hasta que la
/// administración se la asigne. Se dice con el texto del servidor.
class SinViviendaAsignada extends StatelessWidget {
  const SinViviendaAsignada({
    super.key,
    required this.aviso,
    required this.alConsultar,
    required this.alSalir,
  });
  final String aviso;
  final Future<void> Function() alConsultar;
  final void Function() alSalir;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.home_work_outlined, size: 48),
                const SizedBox(height: 12),
                Text(aviso, key: const Key('alta.sinVivienda'), textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton(onPressed: alConsultar, child: const Text('Volver a consultar')),
                TextButton(onPressed: alSalir, child: const Text('Salir')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
