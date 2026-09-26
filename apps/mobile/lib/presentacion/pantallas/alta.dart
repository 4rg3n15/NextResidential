/// Primer ingreso, paso 2 · el formulario 3.2. También el cambio de vivienda
/// desde el perfil (3.5), que es el mismo formulario con el código obligatorio.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// LAS ETIQUETAS SON LAS DE LA COPROPIEDAD
///
/// «Casa» y «Manzana», o «Apartamento» y «Torre»: las manda la API desde la
/// configuración del conjunto (0029). Ninguna se escribe aquí. En un conjunto
/// de apartamentos la torre es obligatoria, y también eso lo dice el servidor.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// «NO LO TENGO» NO ES UN ATAJO
///
/// La casilla sólo vale si la vivienda no tiene todavía ninguna cuenta: si ya
/// hay alguien dentro, el SERVIDOR exige el código que ese primer residente le
/// dio (3.3), limita los intentos y deja rastro de cada fallo. La app no puede
/// saber si la vivienda tiene cuenta —sería decirle a un extraño quién vive
/// dónde—, así que envía lo que el residente marcó y pinta lo que el servidor
/// contestó. En el cambio de vivienda la casilla no existe: siempre hay código.
library;

import 'package:flutter/material.dart';

import '../../dominio/hogar.dart';
import '../../dominio/puertos.dart';
import 'campos_de_perfil.dart';

class PantallaDeAlta extends StatefulWidget {
  const PantallaDeAlta({
    super.key,
    required this.estado,
    required this.repositorio,
    required this.alCompletar,
    this.alSalir,
    this.cambio = false,
    this.perfil,
  });

  final EstadoDeAlta estado;
  final RepositorioDeAlta repositorio;
  final void Function(AltaHecha hecha) alCompletar;

  /// En el primer ingreso: cerrar sesión. En el cambio: volver.
  final void Function()? alSalir;
  final bool cambio;

  /// Para precargar los datos en el cambio de vivienda.
  final PerfilDelResidente? perfil;

  @override
  State<PantallaDeAlta> createState() => _EstadoDeAlta();
}

class _EstadoDeAlta extends State<PantallaDeAlta> {
  final _formulario = GlobalKey<FormState>();
  late final ControlesDePerfil _perfil = ControlesDePerfil(widget.perfil);
  final _vivienda = TextEditingController();
  final _agrupacion = TextEditingController();
  final _codigo = TextEditingController();
  bool _sinCodigo = false;
  bool _enviando = false;
  Map<String, String> _errores = const {};
  String? _rechazo;

  VocabularioDeAlta get _voc => widget.estado.vocabulario;

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
      final r = await widget.repositorio.completarAlta(
        SolicitudDeAlta(
          perfil: _perfil.leer(),
          identificador: _vivienda.text.trim(),
          agrupacion: agrupacion.isEmpty ? null : agrupacion,
          codigo: _sinCodigo ? null : _codigo.text.trim(),
        ),
        cambio: widget.cambio,
      );
      if (!mounted) return;
      switch (r) {
        case AltaHecha():
          widget.alCompletar(r);
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
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.cambio
              ? 'Cambiar de ${_voc.etiquetaVivienda.toLowerCase()}'
              : 'Complete sus datos',
        ),
        automaticallyImplyLeading: widget.cambio,
        actions: [
          if (!widget.cambio && widget.alSalir != null)
            TextButton(onPressed: widget.alSalir, child: const Text('Salir')),
        ],
      ),
      body: SafeArea(
        child: Form(
          key: _formulario,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(_voc.copropiedad, style: t.textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                widget.cambio
                    ? 'Para cambiar de ${_voc.etiquetaVivienda.toLowerCase()} necesita el código '
                          'que le dio quien ya vive allí.'
                    : 'Antes de usar la app, confirme sus datos y la '
                          '${_voc.etiquetaVivienda.toLowerCase()} donde vive.',
              ),
              const SizedBox(height: 16),
              if (_rechazo != null) AvisoDeRechazo(_rechazo!),
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
                    labelText: 'Número de ${_voc.etiquetaVivienda.toLowerCase()}',
                    errorText: _errores['identificador'],
                  ),
                  validator: (v) => (v ?? '').trim().isEmpty
                      ? 'Escriba el número de ${_voc.etiquetaVivienda.toLowerCase()}'
                      : null,
                ),
              ),
              TextFormField(
                key: const Key('alta.codigo'),
                controller: _codigo,
                enabled: !_sinCodigo,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(
                  labelText: 'Código de vinculación',
                  helperText:
                      'Se lo da quien ya vive en la ${_voc.etiquetaVivienda.toLowerCase()}.',
                  errorText: _errores['codigo'],
                ),
                validator: (v) => !_sinCodigo && (v ?? '').trim().isEmpty
                    ? 'Escriba el código o marque «No lo tengo»'
                    : null,
              ),
              if (!widget.cambio)
                CheckboxListTile(
                  key: const Key('alta.sinCodigo'),
                  contentPadding: EdgeInsets.zero,
                  value: _sinCodigo,
                  onChanged: (v) => setState(() => _sinCodigo = v ?? false),
                  title: const Text('No lo tengo'),
                  subtitle: Text(
                    'Sólo si nadie más de su ${_voc.etiquetaVivienda.toLowerCase()} usa la app todavía.',
                  ),
                ),
              const SizedBox(height: 16),
              FilledButton(
                key: const Key('alta.enviar'),
                onPressed: _enviando ? null : _enviar,
                child: Text(_enviando ? 'Enviando…' : (widget.cambio ? 'Cambiar' : 'Continuar')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
