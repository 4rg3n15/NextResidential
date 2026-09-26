/// 3.5 · editar los datos personales y de contacto.
///
/// El documento se enseña al propio titular y a nadie más: la API lo devuelve
/// sólo en esta ruta, y nunca va a un registro (la bitácora anota «perfil
/// editado», no el número). La vivienda NO se cambia aquí: el cambio exige el
/// código de quien ya vive allí y va por su propio formulario.
library;

import 'package:flutter/material.dart';

import '../../dominio/hogar.dart';
import '../../dominio/puertos.dart';
import 'campos_de_perfil.dart';

class PantallaDeEditarPerfil extends StatefulWidget {
  const PantallaDeEditarPerfil({
    super.key,
    required this.perfil,
    required this.repositorio,
    required this.alGuardar,
  });

  final PerfilDelResidente perfil;
  final RepositorioDelHogar repositorio;
  final void Function(PerfilDelResidente guardado) alGuardar;

  @override
  State<PantallaDeEditarPerfil> createState() => _EstadoDelPerfil();
}

class _EstadoDelPerfil extends State<PantallaDeEditarPerfil> {
  final _formulario = GlobalKey<FormState>();
  late final ControlesDePerfil _controles = ControlesDePerfil(widget.perfil);
  bool _enviando = false;
  Map<String, String> _errores = const {};
  String? _rechazo;

  @override
  void dispose() {
    _controles.liberar();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (!(_formulario.currentState?.validate() ?? false)) return;
    setState(() {
      _enviando = true;
      _errores = const {};
      _rechazo = null;
    });
    try {
      final r = await widget.repositorio.editarPerfil(_controles.leer());
      if (!mounted) return;
      switch (r) {
        case PerfilGuardado(perfil: final p):
          widget.alGuardar(p);
        case PerfilConErrores(campos: final c):
          setState(() => _errores = c);
        case PerfilRechazado(detalle: final d):
          setState(() => _rechazo = d);
      }
    } on Fallo catch (f) {
      if (mounted) setState(() => _rechazo = f.detalle);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mis datos')),
      body: SafeArea(
        child: Form(
          key: _formulario,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (_rechazo != null) AvisoDeRechazo(_rechazo!),
              ..._controles.campos(
                errores: _errores,
                alCambiarTipo: (v) => setState(() => _controles.tipoDocumento = v),
              ),
              const SizedBox(height: 8),
              FilledButton(
                key: const Key('perfil.guardar'),
                onPressed: _enviando ? null : _guardar,
                child: Text(_enviando ? 'Guardando…' : 'Guardar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
