/// Las acciones del hogar que abren pantallas (ETAPA 15-I, RONDA 15-W):
/// registrar, editar y eliminar vehículos, editar el perfil, cambiar de
/// vivienda y de contraseña.
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
import 'dependencias.dart';
import 'pantallas/cambio_de_contrasena.dart';
import 'pantallas/cambio_de_vivienda.dart';
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

  /// Las del armazón: sus puertos y sus controladores de vista.
  factory AccionesDelHogar.delArmazon(
    Dependencias d, {
    required ControladorDeVista<List<MiembroDeFamilia>> familia,
    required ControladorDeVista<List<Vehiculo>> vehiculos,
    required ControladorDeVista<PerfilDelResidente> perfil,
    required void Function() alCambiarDeVivienda,
  }) => AccionesDelHogar(
    sesion: d.sesion,
    alta: d.alta,
    hogar: d.hogar,
    cuenta: d.cuenta,
    familia: familia,
    vehiculos: vehiculos,
    perfil: perfil,
    alCambiarDeVivienda: alCambiarDeVivienda,
  );

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

  /// 15-W (D5) · la placa sólo cambia si el vehículo no tiene historial: si
  /// lo tiene, la pantalla enseña el texto del servidor.
  Future<void> editarVehiculo(BuildContext context, Vehiculo v) => _abrir(
    context,
    PantallaDeNuevoVehiculo.editar(
      repositorio: hogar,
      vehiculo: v,
      alRegistrar: () {
        Navigator.of(context).pop();
        _avisar(context, 'Vehículo ${v.placa} actualizado.');
        vehiculos.cargarAhora();
      },
    ),
  );

  /// 15-W (D5) · sin historial se borra; con historial queda dado de baja y su
  /// historial se conserva. Lo decide el servidor y se dice cuál de los dos.
  Future<void> eliminarVehiculo(BuildContext context, Vehiculo v) async {
    final si = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('¿Eliminar ${v.placa}?'),
        content: const Text(
          'Dejará de abrir la talanquera y libera un cupo de su vivienda. Si el vehículo ya '
          'tiene historial en el conjunto, queda dado de baja y su historial se conserva.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(false), child: const Text('Cancelar')),
          FilledButton(
            key: const Key('vehiculos.confirmarEliminar'),
            onPressed: () => Navigator.of(c).pop(true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (si != true || !context.mounted) return;
    try {
      final hecho = await hogar.eliminarVehiculo(v.id);
      if (!context.mounted) return;
      _avisar(context, textoDeEliminacion(hecho, v.placa));
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
        PantallaDeCambioDeVivienda(
          estado: estado,
          repositorio: alta,
          perfil: actual,
          alCompletar: () {
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
