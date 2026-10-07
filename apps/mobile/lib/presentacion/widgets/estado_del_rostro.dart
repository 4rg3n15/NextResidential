/// Lo que se pinta del rostro de una persona —el propio o el de un menor del
/// hogar— (RONDA 15-X, D2 y D3): el estado, las fechas y cada equipo; nunca la
/// imagen. Y lo que se ve si no se pudo leer.
library;

import 'package:flutter/material.dart';

import '../../dominio/puertos.dart';
import '../../dominio/rostro.dart';
import '../pantallas/comunes.dart';

class TarjetaDelEstadoDelRostro extends StatelessWidget {
  const TarjetaDelEstadoDelRostro({super.key, required this.estado});
  final EstadoDeMiRostro estado;

  @override
  Widget build(BuildContext context) {
    final e = estado;
    final registrado = e.registradoEn;
    final vence = e.venceEn;
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ListTile(
            leading: Icon(e.tieneRostro ? Icons.face_retouching_natural : Icons.face_outlined),
            title: Text(textoDelEstado(e), key: const Key('rostro.estado')),
            subtitle: registrado == null || vence == null
                ? null
                : Text('Registrado el ${fechaCorta(registrado)} · vence el ${fechaCorta(vence)}'),
          ),
          for (final q in e.equipos)
            ListTile(
              dense: true,
              leading: const Icon(Icons.door_front_door_outlined, size: 20),
              title: Text(q.nombre),
              trailing: Text(textoDelEquipo(q.estado)),
            ),
        ],
      ),
    );
  }
}

class SinCargarElRostro extends StatelessWidget {
  const SinCargarElRostro({super.key, required this.fallo, required this.alReintentar});
  final Fallo fallo;
  final Future<void> Function() alReintentar;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(24),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.cloud_off_outlined, size: 48),
        const SizedBox(height: 12),
        Text(fallo.detalle, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        FilledButton(onPressed: alReintentar, child: const Text('Reintentar')),
      ],
    ),
  );
}
