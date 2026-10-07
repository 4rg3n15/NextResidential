/// Registrar o editar a un menor del hogar (RONDA 15-W, D-W2, D4).
///
/// Lo hace cualquier adulto de la vivienda. Al registrarlo se elige una plaza
/// LIBRE —las que el servidor devolvió con código— y su documento de menor
/// (tarjeta de identidad o registro civil); al editarlo sólo cambian nombre,
/// parentesco y fecha, porque el documento y la plaza no se reescriben desde
/// el teléfono.
///
/// La fecha tiene su aviso de cortesía: una persona de 18 o más no es un menor
/// y crea su propia cuenta con un código de plaza. Lo decide el SERVIDOR con el
/// día de Bogotá; si rechaza, su texto se pinta tal cual.
library;

import 'package:flutter/material.dart';

import '../../dominio/edad.dart';
import '../../dominio/menores.dart';
import '../../dominio/plazas.dart';
import '../../dominio/puertos.dart';
import '../widgets/campo_de_fecha.dart';
import 'campos_de_perfil.dart' show AvisoDeRechazo;

class PantallaDeMenor extends StatefulWidget {
  /// Registrar uno nuevo en una de `libres`.
  const PantallaDeMenor.nuevo({
    super.key,
    required this.repositorio,
    required this.hoy,
    required List<PlazaDeOcupante> this.libres,
    required this.alGuardar,
  }) : menor = null;

  /// Editar uno ya registrado.
  const PantallaDeMenor.editar({
    super.key,
    required this.repositorio,
    required this.hoy,
    required MenorDelHogar this.menor,
    required this.alGuardar,
  }) : libres = null;

  final RepositorioDeMenores repositorio;
  final DateTime hoy;
  final List<PlazaDeOcupante>? libres;
  final MenorDelHogar? menor;
  final void Function() alGuardar;

  @override
  State<PantallaDeMenor> createState() => _EstadoDelMenor();
}

class _EstadoDelMenor extends State<PantallaDeMenor> {
  final _formulario = GlobalKey<FormState>();
  late final _nombres = TextEditingController(text: widget.menor?.nombres ?? '');
  late final _apellidos = TextEditingController(text: widget.menor?.apellidos ?? '');
  late final _fecha = TextEditingController(text: widget.menor?.fechaNacimiento ?? '');
  late final _parentesco = TextEditingController(text: widget.menor?.parentesco ?? '');
  final _documento = TextEditingController();
  String _tipo = tiposDeDocumentoDeMenor.keys.first;
  late String? _plaza = widget.libres?.firstOrNull?.id;
  bool _enviando = false;
  String? _rechazo;

  bool get _nuevo => widget.menor == null;

  @override
  void dispose() {
    for (final c in [_nombres, _apellidos, _fecha, _parentesco, _documento]) {
      c.dispose();
    }
    super.dispose();
  }

  DatosDelMenor _datos() => DatosDelMenor(
    nombres: _nombres.text.trim(),
    apellidos: _apellidos.text.trim(),
    fechaNacimiento: _fecha.text.trim(),
    parentesco: _parentesco.text.trim(),
  );

  Future<void> _guardar() async {
    if (!(_formulario.currentState?.validate() ?? false)) return;
    setState(() {
      _enviando = true;
      _rechazo = null;
    });
    try {
      final menor = widget.menor;
      if (menor == null) {
        await widget.repositorio.registrarMenor(
          NuevoMenor(
            datos: _datos(),
            tipoDocumento: _tipo,
            numeroDocumento: _documento.text.trim(),
            plazaId: _plaza!,
          ),
        );
      } else {
        await widget.repositorio.editarMenor(menor.residenteId, _datos());
      }
      if (mounted) widget.alGuardar();
    } on Fallo catch (f) {
      if (mounted) setState(() => _rechazo = f.detalle);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  Widget _texto(
    TextEditingController c,
    String campo,
    String etiqueta, {
    required String falta,
    int maximo = 100,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextFormField(
      key: Key('menor.$campo'),
      controller: c,
      maxLength: maximo,
      textCapitalization: TextCapitalization.words,
      decoration: InputDecoration(labelText: etiqueta, counterText: ''),
      validator: (v) => (v ?? '').trim().isEmpty ? falta : null,
    ),
  );

  @override
  Widget build(BuildContext context) {
    final libres = widget.libres ?? const <PlazaDeOcupante>[];
    return Scaffold(
      appBar: AppBar(title: Text(_nuevo ? 'Añadir menor' : 'Editar menor')),
      body: SafeArea(
        child: Form(
          key: _formulario,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                _nuevo
                    ? 'Los menores de edad no tienen cuenta: ocupan una plaza libre de su vivienda.'
                    : widget.menor!.documentoLegible,
              ),
              const SizedBox(height: 16),
              _texto(_nombres, 'nombres', 'Nombres', falta: 'Escriba sus nombres'),
              _texto(_apellidos, 'apellidos', 'Apellidos', falta: 'Escriba sus apellidos'),
              CampoDeFecha(
                key: const Key('menor.fechaNacimiento'),
                controlador: _fecha,
                etiqueta: 'Fecha de nacimiento',
                hoy: widget.hoy,
                validar: (v) => motivoDeFechaDeMenor(v ?? '', widget.hoy),
              ),
              const SizedBox(height: 12),
              _texto(
                _parentesco,
                'parentesco',
                'Parentesco (hija, sobrino…)',
                falta: 'Escriba el parentesco',
                maximo: 60,
              ),
              if (_nuevo) ...[
                DropdownButtonFormField<String>(
                  key: const Key('menor.tipoDocumento'),
                  initialValue: _tipo,
                  decoration: const InputDecoration(labelText: 'Tipo de documento'),
                  items: tiposDeDocumentoDeMenor.entries
                      .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                      .toList(),
                  onChanged: (v) => setState(() => _tipo = v ?? _tipo),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('menor.numeroDocumento'),
                  controller: _documento,
                  maxLength: 24,
                  decoration: const InputDecoration(
                    labelText: 'Número de documento',
                    counterText: '',
                  ),
                  validator: (v) => (v ?? '').trim().length < 4
                      ? 'El documento tiene al menos 4 letras o cifras'
                      : null,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  key: const Key('menor.plaza'),
                  initialValue: _plaza,
                  decoration: const InputDecoration(labelText: 'Plaza libre'),
                  items: libres
                      .map((p) => DropdownMenuItem(value: p.id, child: Text('Plaza ${p.numero}')))
                      .toList(),
                  onChanged: (v) => setState(() => _plaza = v),
                  validator: (v) => v == null ? 'Elija una plaza libre' : null,
                ),
              ],
              const SizedBox(height: 16),
              if (_rechazo != null) AvisoDeRechazo(_rechazo!),
              FilledButton(
                key: const Key('menor.guardar'),
                onPressed: _enviando ? null : _guardar,
                child: Text(_enviando ? 'Guardando…' : (_nuevo ? 'Registrar' : 'Guardar')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
