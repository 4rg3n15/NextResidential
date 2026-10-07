/// Primer ingreso, paso 2 · completar a la PERSONA (RONDA 15-W, D3).
///
/// ─────────────────────────────────────────────────────────────────────────────
/// SIN VIVIENDA NI CÓDIGO
///
/// La cuenta ya trae su vivienda: la del titular la asignó la administración y
/// la de quien usó «Crear cuenta», la plaza de su código. Aquí sólo se piden
/// nombres, documento de ADULTO, teléfono y fecha de nacimiento; el correo es
/// opcional y llega propuesto con el que se escribió al crear la cuenta. El
/// cambio de vivienda desde el perfil, que sí lleva código, es otra pantalla
/// (`cambio_de_vivienda.dart`).
///
/// ─────────────────────────────────────────────────────────────────────────────
/// UNA FECHA DE MENOR BLOQUEA LA CUENTA
///
/// Si la fecha resulta de un menor, el SERVIDOR bloquea la cuenta en ese
/// momento. Por eso la fecha tiene su aviso de cortesía antes de enviar —una
/// errata no debería costar una cuenta— y, si el servidor la bloquea, la
/// pantalla lo dice y sólo ofrece salir: no hay formulario que reintentar.
library;

import 'package:flutter/material.dart';

import '../../dominio/edad.dart';
import '../../dominio/hogar.dart';
import '../../dominio/puertos.dart';
import '../widgets/campo_de_fecha.dart';
import 'campos_de_perfil.dart';

class PantallaDeAlta extends StatefulWidget {
  const PantallaDeAlta({
    super.key,
    required this.estado,
    required this.repositorio,
    required this.hoy,
    required this.alCompletar,
    this.alSalir,
    this.correoDeContacto,
  });

  final EstadoDeAlta estado;
  final RepositorioDeAlta repositorio;

  /// El día de hoy según el reloj de la app.
  final DateTime hoy;

  /// Completado (o ya lo estaba): quien llama vuelve a consultar el estado.
  final void Function() alCompletar;

  /// Cerrar sesión.
  final void Function()? alSalir;

  /// El correo escrito al crear la cuenta, si se acaba de crear.
  final String? correoDeContacto;

  @override
  State<PantallaDeAlta> createState() => _EstadoDeAlta();
}

class _EstadoDeAlta extends State<PantallaDeAlta> {
  final _formulario = GlobalKey<FormState>();
  late final ControlesDePerfil _perfil = ControlesDePerfil.primerIngreso(
    correo: widget.correoDeContacto,
  );
  bool _enviando = false;
  Map<String, String> _errores = const {};
  String? _rechazo;

  /// La cuenta quedó bloqueada por la edad: sólo queda salir.
  String? _bloqueo;

  @override
  void dispose() {
    _perfil.liberar();
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
      final r = await widget.repositorio.completarPrimerIngreso(_perfil.leerPrimerIngreso());
      if (!mounted) return;
      switch (r) {
        case AltaHecha():
          widget.alCompletar();
        case AltaConErrores(campos: final c):
          setState(() => _errores = c);
        case AltaRechazada(bloqueadaPorEdad: true, explicacion: final e):
          setState(() => _bloqueo = e);
        // Ya estaba hecho (otro aparato, un doble toque): se sigue adelante.
        case AltaRechazada(motivo: motivoYaVinculada):
          widget.alCompletar();
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
    final bloqueo = _bloqueo;
    if (bloqueo != null) return _CuentaBloqueada(explicacion: bloqueo, alSalir: widget.alSalir);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Complete sus datos'),
        automaticallyImplyLeading: false,
        actions: [
          if (widget.alSalir != null)
            TextButton(onPressed: widget.alSalir, child: const Text('Salir')),
        ],
      ),
      body: SafeArea(
        child: Form(
          key: _formulario,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                widget.estado.vocabulario.copropiedad,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 4),
              const Text(
                'Antes de usar la app, complete sus datos. Su cuenta ya tiene su vivienda: '
                'no hace falta escribirla.',
              ),
              const SizedBox(height: 16),
              ..._perfil.campos(
                errores: _errores,
                tipos: tiposDeDocumentoDeAdulto,
                correoOpcional: true,
                alCambiarTipo: (v) => setState(() => _perfil.tipoDocumento = v),
                fecha: Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: CampoDeFecha(
                    key: const Key('perfil.fechaNacimiento'),
                    controlador: _perfil.fechaNacimiento,
                    etiqueta: 'Fecha de nacimiento',
                    hoy: widget.hoy,
                    error: _errores['fechaNacimiento'],
                    validar: (v) => motivoDeFechaDeAdulto(v ?? '', widget.hoy),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              // Junto al botón: es donde se mira después de pulsarlo.
              if (_rechazo != null) AvisoDeRechazo(_rechazo!),
              FilledButton(
                key: const Key('alta.enviar'),
                onPressed: _enviando ? null : _enviar,
                child: Text(_enviando ? 'Enviando…' : 'Continuar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// La cuenta se bloqueó por la edad. No hay nada que corregir aquí: un adulto
/// de su hogar lo registra como menor desde «Mi familia».
class _CuentaBloqueada extends StatelessWidget {
  const _CuentaBloqueada({required this.explicacion, required this.alSalir});
  final String explicacion;
  final void Function()? alSalir;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.lock_outline, size: 48),
                const SizedBox(height: 12),
                Text(explicacion, key: const Key('alta.bloqueada'), textAlign: TextAlign.center),
                const SizedBox(height: 16),
                if (alSalir != null) FilledButton(onPressed: alSalir, child: const Text('Salir')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
