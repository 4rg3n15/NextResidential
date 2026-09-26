/// D5 a · registrar un vehículo PROPIO: activo al instante, dentro del tope.
///
/// El tope (2 por vivienda, configurable por el superadministrador) no se
/// cuenta aquí: lo cuenta la BASE, bajo un bloqueo por vivienda, para que dos
/// teléfonos pulsando a la vez no metan un tercero (ADR-026). La app pinta lo
/// que contestó el servidor, incluido el «el siguiente lo registra la
/// administración» cuando se alcanza.
///
/// Los vehículos de terceros NO entran por aquí: entran con una autorización
/// de visitante con día y franja (D5 b), sin límite de cantidad.
library;

import 'package:flutter/material.dart';

import '../../dominio/entidades.dart';
import '../../dominio/hogar.dart';
import '../../dominio/puertos.dart';
import 'campos_de_perfil.dart';

class PantallaDeNuevoVehiculo extends StatefulWidget {
  const PantallaDeNuevoVehiculo({
    super.key,
    required this.repositorio,
    required this.ocupantes,
    required this.alRegistrar,
  });

  final RepositorioDelHogar repositorio;

  /// Los residentes activos de la vivienda: el vehículo es de uno o varios.
  final List<MiembroDeFamilia> ocupantes;
  final void Function() alRegistrar;

  @override
  State<PantallaDeNuevoVehiculo> createState() => _EstadoDelVehiculo();
}

class _EstadoDelVehiculo extends State<PantallaDeNuevoVehiculo> {
  final _formulario = GlobalKey<FormState>();
  final _placa = TextEditingController();
  final _color = TextEditingController();
  final _modelo = TextEditingController();
  final _marca = TextEditingController();
  String _tipo = 'automovil';
  final Set<String> _elegidos = {};
  bool _enviando = false;
  VehiculoRechazado? _rechazo;
  String? _error;

  List<MiembroDeFamilia> get _activos => widget.ocupantes.where((o) => o.activo).toList();

  @override
  void dispose() {
    for (final c in [_placa, _color, _modelo, _marca]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _registrar() async {
    if (!(_formulario.currentState?.validate() ?? false)) return;
    if (_elegidos.isEmpty) {
      setState(() => _error = 'Elija al menos un ocupante que use el vehículo');
      return;
    }
    setState(() {
      _enviando = true;
      _rechazo = null;
      _error = null;
    });
    try {
      final marca = _marca.text.trim();
      final r = await widget.repositorio.registrarVehiculo(
        NuevoVehiculo(
          placa: _placa.text.trim(),
          color: _color.text.trim(),
          modelo: _modelo.text.trim(),
          marca: marca.isEmpty ? null : marca,
          tipo: _tipo,
          ocupantes: _elegidos.toList(),
        ),
      );
      if (!mounted) return;
      switch (r) {
        case VehiculoRegistrado():
          widget.alRegistrar();
        case VehiculoRechazado():
          setState(() => _rechazo = r);
      }
    } on Fallo catch (f) {
      if (mounted) setState(() => _error = f.detalle);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  Widget _campo(TextEditingController c, String etiqueta, String clave, {bool requerido = true}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          key: Key('vehiculo.$clave'),
          controller: c,
          textCapitalization: clave == 'placa'
              ? TextCapitalization.characters
              : TextCapitalization.sentences,
          decoration: InputDecoration(labelText: etiqueta),
          validator: (v) =>
              requerido && (v ?? '').trim().isEmpty ? 'Escriba $etiqueta'.toLowerCase() : null,
        ),
      );

  @override
  Widget build(BuildContext context) {
    final rechazo = _rechazo;
    return Scaffold(
      appBar: AppBar(title: const Text('Registrar vehículo')),
      body: SafeArea(
        child: Form(
          key: _formulario,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (rechazo != null)
                AvisoDeRechazo(
                  rechazo.esTope
                      ? '${rechazo.explicacion}\n\nSi necesita registrar otro, pídaselo a la administración.'
                      : rechazo.explicacion,
                ),
              if (_error != null) AvisoDeRechazo(_error!),
              _campo(_placa, 'Placa', 'placa'),
              _campo(_color, 'Color', 'color'),
              _campo(_modelo, 'Modelo', 'modelo'),
              _campo(_marca, 'Marca (opcional)', 'marca', requerido: false),
              DropdownButtonFormField<String>(
                key: const Key('vehiculo.tipo'),
                initialValue: _tipo,
                decoration: const InputDecoration(labelText: 'Tipo'),
                items: tiposDeVehiculo.entries
                    .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                    .toList(),
                onChanged: (v) => setState(() => _tipo = v ?? 'automovil'),
              ),
              const SizedBox(height: 16),
              Text('¿Quién lo usa?', style: Theme.of(context).textTheme.titleSmall),
              if (_activos.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('No hay ocupantes activos en su vivienda.'),
                ),
              ..._activos.map(
                (o) => CheckboxListTile(
                  key: Key('vehiculo.ocupante.${o.residenteId}'),
                  contentPadding: EdgeInsets.zero,
                  value: _elegidos.contains(o.residenteId),
                  title: Text(o.nombre),
                  onChanged: (v) => setState(() {
                    if (v == true) {
                      _elegidos.add(o.residenteId);
                    } else {
                      _elegidos.remove(o.residenteId);
                    }
                  }),
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(
                key: const Key('vehiculo.registrar'),
                onPressed: _enviando ? null : _registrar,
                child: Text(_enviando ? 'Registrando…' : 'Registrar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
