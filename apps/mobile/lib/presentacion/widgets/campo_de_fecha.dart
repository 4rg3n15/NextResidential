/// Un campo de fecha de nacimiento: se escribe como `AAAA-MM-DD` o se elige en
/// el calendario (RONDA 15-W).
///
/// Lo comparten «Crear cuenta», el primer ingreso y el formulario de un menor.
/// El valor viaja tal como lo pide el servidor (`AAAA-MM-DD`), así que el
/// calendario sólo escribe en el campo: no hay un segundo estado que se pueda
/// desincronizar del texto. «Hoy» llega de quien monta la pantalla —el reloj
/// de la app—, no de `DateTime.now()`.
library;

import 'package:flutter/material.dart';

String _dos(int n) => n.toString().padLeft(2, '0');

class CampoDeFecha extends StatelessWidget {
  const CampoDeFecha({
    super.key,
    required this.controlador,
    required this.etiqueta,
    required this.hoy,
    this.validar,
    this.error,
    this.alCambiar,
  });

  final TextEditingController controlador;
  final String etiqueta;

  /// El último día elegible en el calendario.
  final DateTime hoy;
  final String? Function(String?)? validar;

  /// El que devolvió el servidor para este campo.
  final String? error;
  final VoidCallback? alCambiar;

  Future<void> _elegir(BuildContext context) async {
    final escrita = DateTime.tryParse(controlador.text.trim());
    final ultimo = DateTime(hoy.year, hoy.month, hoy.day);
    final inicial = escrita == null || escrita.isAfter(ultimo)
        ? DateTime(ultimo.year - 20)
        : escrita;
    final elegida = await showDatePicker(
      context: context,
      initialDate: inicial.isBefore(DateTime(1900)) ? DateTime(1900) : inicial,
      firstDate: DateTime(1900),
      lastDate: ultimo,
      initialEntryMode: DatePickerEntryMode.calendarOnly,
    );
    if (elegida == null) return;
    controlador.text = '${elegida.year}-${_dos(elegida.month)}-${_dos(elegida.day)}';
    alCambiar?.call();
  }

  @override
  Widget build(BuildContext context) {
    // La clave de este widget basta para encontrarlo y escribir en él: el
    // campo de texto es su único `EditableText`.
    return TextFormField(
      controller: controlador,
      keyboardType: TextInputType.datetime,
      decoration: InputDecoration(
        labelText: etiqueta,
        helperText: 'AAAA-MM-DD',
        errorText: error,
        suffixIcon: IconButton(
          tooltip: 'Elegir en el calendario',
          icon: const Icon(Icons.calendar_month_outlined),
          onPressed: () => _elegir(context),
        ),
      ),
      validator: validar,
      onChanged: (_) => alCambiar?.call(),
    );
  }
}
