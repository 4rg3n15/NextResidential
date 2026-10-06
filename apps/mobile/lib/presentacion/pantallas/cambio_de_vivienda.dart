/// Cambiar de vivienda desde el perfil (3.5): siempre con el código de una
/// plaza libre de la vivienda de destino.
///
/// Era el modo «cambio» del formulario del primer ingreso. Desde la 15-W el
/// primer ingreso ya no lleva vivienda ni código (la cuenta trae la suya), así
/// que los dos formularios dejaron de parecerse y éste vive aparte.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// LAS ETIQUETAS SON LAS DE LA COPROPIEDAD
///
/// «Casa» y «Manzana», o «Apartamento» y «Torre»: las manda la API desde la
/// configuración del conjunto. Ninguna se escribe aquí. En un conjunto de
/// apartamentos la torre es obligatoria, y también eso lo dice el servidor.
///
/// El código se acepta con o sin el prefijo del conjunto («MIRA-K7PQ-2XWZ» o
/// «K7PQ-2XWZ»): el servidor lo normaliza, cuenta los intentos fallidos y deja
/// rastro de cada uno. La app envía lo escrito y pinta lo que contestó.
library;

import 'package:flutter/material.dart';

import '../../dominio/hogar.dart';
import '../../dominio/puertos.dart';
import 'campos_de_perfil.dart';

class PantallaDeCambioDeVivienda extends StatefulWidget {
  const PantallaDeCambioDeVivienda({
    super.key,
    required this.estado,
    required this.repositorio,
    required this.alCompletar,
    this.perfil,
  });

  final EstadoDeAlta estado;
  final RepositorioDeAlta repositorio;
  final void Function() alCompletar;

  /// Para precargar los datos de la persona.
  final PerfilDelResidente? perfil;

  @override
  State<PantallaDeCambioDeVivienda> createState() => _EstadoDelCambio();
}

class _EstadoDelCambio extends State<PantallaDeCambioDeVivienda> {
  final _formulario = GlobalKey<FormState>();
  late final ControlesDePerfil _perfil = ControlesDePerfil(widget.perfil);
  final _vivienda = TextEditingController();
  final _agrupacion = TextEditingController();
  final _codigo = TextEditingController();
  bool _enviando = false;
  Map<String, String> _errores = const {};
  String? _rechazo;

  VocabularioDeAlta get _voc => widget.estado.vocabulario;
  String get _casa => _voc.etiquetaVivienda.toLowerCase();

  @override
  void dispose() {
    _perfil.liberar();
    _vivienda.dispose();
    _agrupacion.dispose();
    _codigo.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    if (!(_formulario.currentState?.validate() ?? false)) return;
    setState(() {
      _enviando = true;
      _errores = const {};
      _rechazo = null;
    });
    try {
      final agrupacion = _agrupacion.text.trim();
      final r = await widget.repositorio.cambiarDeVivienda(
        SolicitudDeCambioDeVivienda(
          perfil: _perfil.leer(),
          identificador: _vivienda.text.trim(),
          agrupacion: agrupacion.isEmpty ? null : agrupacion,
          codigo: _codigo.text.trim(),
        ),
      );
      if (!mounted) return;
      switch (r) {
        case AltaHecha():
          widget.alCompletar();
        case AltaConErrores(campos: final c):
          setState(() => _errores = c);
        case AltaRechazada(explicacion: final e):
          setState(() => _rechazo = e);
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
      appBar: AppBar(title: Text('Cambiar de $_casa')),
      body: SafeArea(
        child: Form(
          key: _formulario,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(_voc.copropiedad, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                'Para cambiar de $_casa necesita el código de una plaza libre de la nueva: '
                'se lo da su titular.',
              ),
              const SizedBox(height: 16),
              ..._perfil.campos(
                errores: _errores,
                alCambiarTipo: (v) => setState(() => _perfil.tipoDocumento = v),
              ),
              const Divider(height: 24),
              if (widget.estado.pideAgrupacion || _voc.etiquetaAgrupacion.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: TextFormField(
                    key: const Key('alta.agrupacion'),
                    controller: _agrupacion,
                    decoration: InputDecoration(
                      labelText: widget.estado.pideAgrupacion
                          ? _voc.etiquetaAgrupacion
                          : '${_voc.etiquetaAgrupacion} (si aplica)',
                      errorText: _errores['agrupacion'],
                    ),
                    validator: (v) => widget.estado.pideAgrupacion && (v ?? '').trim().isEmpty
                        ? 'Escriba ${_voc.etiquetaAgrupacion.toLowerCase()}'
                        : null,
                  ),
                ),
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextFormField(
                  key: const Key('alta.vivienda'),
                  controller: _vivienda,
                  decoration: InputDecoration(
                    labelText: 'Número de $_casa',
                    errorText: _errores['identificador'],
                  ),
                  validator: (v) => (v ?? '').trim().isEmpty ? 'Escriba el número de $_casa' : null,
                ),
              ),
              TextFormField(
                key: const Key('alta.codigo'),
                controller: _codigo,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(
                  labelText: 'Código de la plaza',
                  helperText: 'Con o sin el código del conjunto, como MIRA-K7PQ-2XWZ.',
                  errorText: _errores['codigo'],
                ),
                validator: (v) => (v ?? '').trim().isEmpty ? 'Escriba el código de la plaza' : null,
              ),
              const SizedBox(height: 16),
              if (_rechazo != null) AvisoDeRechazo(_rechazo!),
              FilledButton(
                key: const Key('alta.enviar'),
                onPressed: _enviando ? null : _enviar,
                child: Text(_enviando ? 'Enviando…' : 'Cambiar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
