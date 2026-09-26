/// La puerta del primer ingreso (3.2): hasta completarlo, no se ve ninguna otra
/// pantalla.
///
/// Qué pantalla toca lo decide `pasoDePrimerIngreso` (dominio, puro): el cambio
/// de contraseña pendiente que viaja en el token, si hay vivienda vinculada, y
/// si el primer residente aún no declaró sus ocupantes. Esta pieza sólo pide a
/// la API lo que falta saber y monta la pantalla del paso.
///
/// La puerta NO es la barrera: la barrera es el servidor, que responde 403 a
/// una cuenta con el cambio pendiente y 404 a una sin vivienda. La puerta evita
/// que el residente vea esas respuestas como errores.
library;

import 'package:flutter/material.dart';

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/acceso.dart';
import '../../dominio/hogar.dart';
import '../../dominio/puertos.dart';
import 'alta.dart';
import 'cambio_de_contrasena.dart';
import 'ocupantes.dart';

class PuertaDePrimerIngreso extends StatefulWidget {
  const PuertaDePrimerIngreso({
    super.key,
    required this.sesion,
    required this.alta,
    required this.cuenta,
    required this.alTerminar,
    required this.alSalir,
    this.recuperada = false,
  });

  final SesionEnUso sesion;
  final RepositorioDeAlta alta;
  final ServicioDeCuenta cuenta;
  final void Function() alTerminar;
  final void Function() alSalir;

  /// La sesión se recuperó del llavero al arrancar, en vez de abrirse ahora.
  /// `[SUPUESTO]` S-59 · sin red al arrancar con una sesión así, se deja pasar
  /// a la app —que pinta su estado sin conexión— en vez de bloquearla: el
  /// servidor sigue imponiendo el alta en cuanto haya red.
  final bool recuperada;

  @override
  State<PuertaDePrimerIngreso> createState() => _EstadoDeLaPuerta();
}

class _EstadoDeLaPuerta extends State<PuertaDePrimerIngreso> {
  EstadoDeAlta? _estado;
  Fallo? _fallo;
  bool _consultando = false;

  bool get _debeCambiar => widget.sesion.sesion?.debeCambiarContrasena ?? false;

  PasoDePrimerIngreso get _paso => pasoDePrimerIngreso(
    debeCambiarContrasena: _debeCambiar,
    viviendaVinculada: _estado?.viviendaVinculada,
    debeDeclararOcupantes: _estado?.debeDeclararOcupantes ?? false,
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _avanzar());
  }

  /// Consulta lo que falta, o termina si ya no falta nada.
  Future<void> _avanzar() async {
    if (!mounted) return;
    switch (_paso) {
      case PasoDePrimerIngreso.listo:
        widget.alTerminar();
      case PasoDePrimerIngreso.consultarAlta:
        await _consultar();
      case PasoDePrimerIngreso.cambiarContrasena:
      case PasoDePrimerIngreso.completarAlta:
      case PasoDePrimerIngreso.declararOcupantes:
        setState(() {});
    }
  }

  Future<void> _consultar() async {
    setState(() {
      _consultando = true;
      _fallo = null;
    });
    try {
      final e = await widget.alta.miAlta();
      if (!mounted) return;
      setState(() => _estado = e);
      await _avanzar();
    } on Fallo catch (f) {
      if (!mounted) return;
      if (f.clase == ClaseDeFallo.sinConexion && widget.recuperada) {
        widget.alTerminar();
        return;
      }
      if (f.clase == ClaseDeFallo.sesionInvalida) {
        widget.alSalir();
        return;
      }
      setState(() => _fallo = f);
    } finally {
      if (mounted) setState(() => _consultando = false);
    }
  }

  Future<void> _trasCambiar() async {
    // ADR-023 · el token vigente aún lleva el indicador: se renueva.
    final renovada = await widget.sesion.renovarTrasCambio();
    if (!mounted) return;
    if (renovada == null) {
      widget.alSalir();
      return;
    }
    await _avanzar();
  }

  @override
  Widget build(BuildContext context) {
    final estado = _estado;
    switch (_paso) {
      case PasoDePrimerIngreso.cambiarContrasena:
        return PantallaDeCambioDeContrasena(
          servicio: widget.cuenta,
          alCambiar: _trasCambiar,
          alSalir: widget.alSalir,
        );
      case PasoDePrimerIngreso.completarAlta when estado != null:
        return PantallaDeAlta(
          estado: estado,
          repositorio: widget.alta,
          alSalir: widget.alSalir,
          alCompletar: (hecha) {
            setState(() => _estado = null);
            _consultar();
          },
        );
      case PasoDePrimerIngreso.declararOcupantes when estado != null:
        return PantallaDeDeclararOcupantes(
          aviso: estado.avisoOcupantes,
          repositorio: widget.alta,
          alSalir: widget.alSalir,
          alDeclarar: (_) {
            setState(() => _estado = null);
            _consultar();
          },
        );
      default:
        return _Consultando(
          consultando: _consultando,
          fallo: _fallo,
          alReintentar: _consultar,
          alSalir: widget.alSalir,
        );
    }
  }
}

class _Consultando extends StatelessWidget {
  const _Consultando({
    required this.consultando,
    required this.fallo,
    required this.alReintentar,
    required this.alSalir,
  });

  final bool consultando;
  final Fallo? fallo;
  final Future<void> Function() alReintentar;
  final void Function() alSalir;

  @override
  Widget build(BuildContext context) {
    final f = fallo;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: f == null || consultando
                ? const CircularProgressIndicator()
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.cloud_off_outlined, size: 48),
                      const SizedBox(height: 12),
                      Text(f.detalle, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: alReintentar, child: const Text('Reintentar')),
                      TextButton(onPressed: alSalir, child: const Text('Salir')),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
