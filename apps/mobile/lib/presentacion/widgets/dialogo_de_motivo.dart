/// Pedir un MOTIVO antes de una escritura que lo exige (RONDA 15-W).
///
/// Retirar una plaza, dar de baja a un menor y revocar una visita llevan motivo
/// obligatorio, y el servidor lo valida con su mínimo y su máximo. El diálogo
/// es uno para los tres: el botón de confirmar no responde hasta que el motivo
/// tiene el mínimo de letras —sin eso, el residente leería el rechazo después
/// del viaje— y el contador dice cuánto cabe. Cancelar devuelve `null` y no se
/// escribe nada.
library;

import 'package:flutter/material.dart';

Future<String?> pedirMotivo(
  BuildContext context, {
  required String titulo,
  required String explicacion,
  required String accion,
  int minimo = 1,
  int maximo = 300,
}) => showDialog<String>(
  context: context,
  builder: (_) => _DialogoDeMotivo(
    titulo: titulo,
    explicacion: explicacion,
    accion: accion,
    minimo: minimo,
    maximo: maximo,
  ),
);

class _DialogoDeMotivo extends StatefulWidget {
  const _DialogoDeMotivo({
    required this.titulo,
    required this.explicacion,
    required this.accion,
    required this.minimo,
    required this.maximo,
  });

  final String titulo;
  final String explicacion;
  final String accion;
  final int minimo;
  final int maximo;

  @override
  State<_DialogoDeMotivo> createState() => _EstadoDelDialogo();
}

class _EstadoDelDialogo extends State<_DialogoDeMotivo> {
  final _motivo = TextEditingController();

  @override
  void dispose() {
    _motivo.dispose();
    super.dispose();
  }

  bool get _suficiente => _motivo.text.trim().length >= widget.minimo;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.titulo),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.explicacion),
          const SizedBox(height: 12),
          TextField(
            key: const Key('motivo.texto'),
            controller: _motivo,
            autofocus: true,
            maxLength: widget.maximo,
            maxLines: 3,
            minLines: 1,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Motivo',
              helperText: widget.minimo > 1 ? 'Al menos ${widget.minimo} letras' : 'Obligatorio',
            ),
            onChanged: (_) => setState(() {}),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancelar')),
        FilledButton(
          key: const Key('motivo.confirmar'),
          onPressed: _suficiente ? () => Navigator.of(context).pop(_motivo.text.trim()) : null,
          child: Text(widget.accion),
        ),
      ],
    );
  }
}
