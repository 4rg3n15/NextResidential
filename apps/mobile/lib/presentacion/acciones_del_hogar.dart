/// Las acciones del hogar que abren pantallas (ETAPA 15-I): registrar y dar de
/// baja vehículos, editar el perfil, cambiar de vivienda y de contraseña.
///
/// Viven fuera del armazón por SRP: el armazón gobierna la sesión y la
/// navegación principal; esto traduce un toque en una pantalla y una recarga.
/// Cada acción recarga SÓLO lo que cambió.
library;

import 'package:flutter/material.dart';

import '../aplicacion/estado.dart';
import '../aplicacion/sesion_en_uso.dart';
import '../dominio/entidades.dart';
import '../dominio/hogar.dart';
import '../dominio/puertos.dart';
import 'controlador.dart';
import 'pantallas/alta.dart';
import 'pantallas/cambio_de_contrasena.dart';
import 'pantallas/editar_perfil.dart';
import 'pantallas/nuevo_vehiculo.dart';

class AccionesDelHogar {
  AccionesDelHogar({
    required this.sesion,
    required this.alta,
    required this.hogar,
    required this.cuenta,
    required this.familia,
    required this.vehiculos,
    required this.perfil,
    required this.alCambiarDeVivienda,
  });

  final SesionEnUso sesion;
  final RepositorioDeAlta alta;
  final RepositorioDelHogar hogar;
  final ServicioDeCuenta cuenta;
  final ControladorDeVista<List<MiembroDeFamilia>> familia;
  final ControladorDeVista<List<Vehiculo>> vehiculos;
  final ControladorDeVista<PerfilDelResidente> perfil;

  /// Tras un cambio de vivienda TODO lo que se ve es de otra: se recarga todo.
  final void Function() alCambiarDeVivienda;

  Future<void> _abrir(BuildContext context, Widget pantalla) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => pantalla));

  void _avisar(BuildContext context, String texto) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texto)));

  Future<void> registrarVehiculo(BuildContext context) async {
    final ocupantes = switch (familia.estado) {
      ConDatos<List<MiembroDeFamilia>>(datos: final d) => d,
      _ => await hogarFamilia(),
    };
    if (!context.mounted) return;
    await _abrir(
      context,
      PantallaDeNuevoVehiculo(
        repositorio: hogar,
        ocupantes: ocupantes,
        alRegistrar: () {
          Navigator.of(context).pop();
          _avisar(context, 'Vehículo registrado. Ya está activo.');
          vehiculos.cargarAhora();
        },
      ),
    );
  }

  /// La familia recién leída, si aún no estaba cargada. Sin ella no hay a quién
  /// asignar el vehículo, y la pantalla lo dice.
  Future<List<MiembroDeFamilia>> hogarFamilia() async {
    await familia.cargarAhora();
    final e = familia.estado;
    return e is ConDatos<List<MiembroDeFamilia>> ? e.datos : const [];
  }

  Future<void> desactivarVehiculo(BuildContext context, Vehiculo v) async {
    final si = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('¿Dar de baja ${v.placa}?'),
        content: const Text('Dejará de abrir la talanquera. Libera un cupo de su vivienda.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(false), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () => Navigator.of(c).pop(true),
            child: const Text('Dar de baja'),
          ),
        ],
      ),
    );
    if (si != true || !context.mounted) return;
    try {
      final hecho = await hogar.desactivarVehiculo(v.id);
      if (!context.mounted) return;
      _avisar(
        context,
        hecho
            ? 'Vehículo dado de baja.'
            : 'Este vehículo lo registró la administración: sólo ella puede darlo de baja.',
      );
      vehiculos.cargarAhora();
    } on Fallo catch (f) {
      if (context.mounted) _avisar(context, f.detalle);
    }
  }

  Future<void> editarPerfil(BuildContext context, PerfilDelResidente actual) => _abrir(
    context,
    PantallaDeEditarPerfil(
      perfil: actual,
      repositorio: hogar,
      alGuardar: (_) {
        Navigator.of(context).pop();
        _avisar(context, 'Datos guardados.');
        perfil.cargarAhora();
      },
    ),
  );

  Future<void> cambiarVivienda(BuildContext context, PerfilDelResidente? actual) async {
    try {
      final estado = await alta.miAlta();
      if (!context.mounted) return;
      await _abrir(
        context,
        PantallaDeAlta(
          estado: estado,
          repositorio: alta,
          cambio: true,
          perfil: actual,
          alCompletar: (_) {
            Navigator.of(context).pop();
            _avisar(context, 'Vivienda cambiada.');
            alCambiarDeVivienda();
          },
        ),
      );
    } on Fallo catch (f) {
      if (context.mounted) _avisar(context, f.detalle);
    }
  }

  Future<void> cambiarContrasena(BuildContext context) => _abrir(
    context,
    PantallaDeCambioDeContrasena(
      servicio: cuenta,
      alSalir: () => Navigator.of(context).pop(),
      alCambiar: () async {
        await sesion.renovarTrasCambio();
        if (!context.mounted) return;
        Navigator.of(context).pop();
        _avisar(context, 'Contraseña cambiada.');
      },
    ),
  );
}
