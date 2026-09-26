/// Primer ingreso, paso 1 · cambiar la contraseña inicial (ADR-023, D4).
///
/// La contraseña con la que entra el residente la puso una persona —el
/// superadministrador al crear la cuenta, o al restablecerla (D4)—. Mientras no
/// la cambie, el SERVIDOR responde 403 a todo lo demás; esta pantalla existe
/// para que ese 403 no sea lo que ve, sino el paso que le toca.
///
/// Tras el cambio, el token vigente todavía lleva el indicador: quien use esta
/// pantalla renueva la sesión para que el gancho de la base emita uno sin él.
library;

import 'package:flutter/material.dart';

import '../../dominio/acceso.dart';
import '../../dominio/hogar.dart';
import '../../dominio/puertos.dart';
import 'campos_de_perfil.dart';

class PantallaDeCambioDeContrasena extends StatefulWidget {
  const PantallaDeCambioDeContrasena({
    super.key,
    required this.servicio,
    required this.alCambiar,
    required this.alSalir,
  });

  final ServicioDeCuenta servicio;
  final Future<void> Function() alCambiar;
  final void Function() alSalir;

  @override
  State<PantallaDeCambioDeContrasena> createState() => _Estado();
}

class _Estado extends State<PantallaDeCambioDeContrasena> {
  final _formulario = GlobalKey<FormState>();
  final _actual = TextEditingController();
  final _nueva = TextEditingController();
  final _repetida = TextEditingController();
  bool _enviando = false;
  String? _rechazo;

  @override
  void dispose() {
    _actual.dispose();
    _nueva.dispose();
    _repetida.dispose();
    super.dispose();
  }

  Future<void> _cambiar() async {
    if (!(_formulario.currentState?.validate() ?? false)) return;
    setState(() {
      _enviando = true;
      _rechazo = null;
    });
    try {
      await widget.servicio.cambiarContrasena(actual: _actual.text, nueva: _nueva.text);
      await widget.alCambiar();
    } on Fallo catch (f) {
      if (mounted) setState(() => _rechazo = f.detalle);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cambie su contraseña'),
        automaticallyImplyLeading: false,
        actions: [TextButton(onPressed: widget.alSalir, child: const Text('Salir'))],
      ),
      body: SafeArea(
        child: Form(
          key: _formulario,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'La contraseña con la que entró la asignó la administración. Antes de seguir, '
                'elija una que sólo usted conozca.',
              ),
              const SizedBox(height: 16),
              if (_rechazo != null) AvisoDeRechazo(_rechazo!),
              TextFormField(
                key: const Key('contrasena.actual'),
                controller: _actual,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Contraseña actual (la asignada)'),
                validator: (v) => (v == null || v.isEmpty) ? 'Escriba la contraseña actual' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                key: const Key('contrasena.nueva'),
                controller: _nueva,
                obscureText: true,
                autofillHints: const [AutofillHints.newPassword],
                decoration: const InputDecoration(
                  labelText: 'Contraseña nueva',
                  helperText: '8 o más caracteres, con mayúscula, minúscula, número y símbolo',
                  helperMaxLines: 2,
                ),
                validator: (v) => motivoDeRechazoDeContrasena(v ?? ''),
              ),
              const SizedBox(height: 12),
              TextFormField(
                key: const Key('contrasena.repetida'),
                controller: _repetida,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Repita la contraseña nueva'),
                validator: (v) => v == _nueva.text ? null : 'Las dos contraseñas no coinciden',
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _enviando ? null : _cambiar,
                child: Text(_enviando ? 'Guardando…' : 'Cambiar contraseña'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
