/// La política de tratamiento de datos y su casilla, en «Crear cuenta»
/// (RONDA 15-W, Ley 1581 de 2012).
///
/// La autorización tiene que ser previa, expresa e informada: el texto se lee
/// AQUÍ, entero, antes de la casilla, y es el que mandó el servidor con su
/// versión —la app no tiene una copia propia que pudiera quedarse vieja—.
/// Mientras no llega no hay casilla que marcar, y sin casilla el botón de
/// crear la cuenta no responde.
library;

import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/puertos.dart';
import '../../dominio/registro.dart';
import 'servidor.dart';

class CasillaDePolitica extends StatelessWidget {
  const CasillaDePolitica({
    super.key,
    required this.politica,
    required this.fallo,
    required this.aceptada,
    required this.alCambiar,
    required this.alReintentar,
    this.aviso,
  });

  /// `null` mientras llega (o si no llegó: entonces hay `fallo`).
  final PoliticaDeDatos? politica;
  final Fallo? fallo;
  final bool aceptada;
  final ValueChanged<bool> alCambiar;
  final VoidCallback alReintentar;

  /// La política cambió mientras se llenaba el formulario.
  final String? aviso;

  @override
  Widget build(BuildContext context) {
    final p = politica;
    final f = fallo;
    if (p == null && f != null) return _SinPolitica(fallo: f, alReintentar: alReintentar);
    if (p == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
            SizedBox(width: 12),
            Expanded(child: Text('Cargando la política de tratamiento de datos…')),
          ],
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Tratamiento de sus datos', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        if (aviso != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(aviso!, style: TextStyle(color: Paleta.avisoSuave.texto)),
          ),
        Container(
          constraints: const BoxConstraints(maxHeight: 180),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border.all(color: Paleta.borde),
            borderRadius: BorderRadius.circular(10),
          ),
          child: SingleChildScrollView(child: Text(p.texto, key: const Key('registro.politica'))),
        ),
        CheckboxListTile(
          key: const Key('registro.acepto'),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: aceptada,
          onChanged: (v) => alCambiar(v ?? false),
          title: const Text('He leído y acepto la política de tratamiento de mis datos'),
        ),
      ],
    );
  }
}

class _SinPolitica extends StatelessWidget {
  const _SinPolitica({required this.fallo, required this.alReintentar});
  final Fallo fallo;
  final VoidCallback alReintentar;

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
            'No se pudo cargar la política de tratamiento de datos, y sin aceptarla no se crea '
            'la cuenta. ${fallo.detalle}',
            style: TextStyle(color: Paleta.avisoSuave.texto),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.tonal(onPressed: alReintentar, child: const Text('Reintentar')),
              if (esFalloDeConexion(fallo)) const BotonCambiarServidor(),
            ],
          ),
        ],
      ),
    );
  }
}
