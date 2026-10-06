/// Las cinco pestañas del mockup y los controladores que las alimentan.
///
/// Salió de `app.dart` (15-L) cuando el armazón pasó a gobernar también el
/// ciclo de recarga: el armazón decide CUÁNDO se recarga y qué está a la vista;
/// esto dice QUÉ lectura corresponde a cada pestaña y la pinta.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../dominio/bandeja_de_salida.dart';
import '../dominio/entidades.dart';
import '../dominio/hogar.dart';
import '../dominio/menores.dart';
import '../dominio/notificaciones.dart';
import '../dominio/puertos.dart';
import 'acciones_del_hogar.dart';
import 'controlador.dart';
import 'dependencias.dart';
import 'pantallas/inicio.dart';
import 'pantallas/perfil.dart';
import 'pantallas/vehiculos.dart';
import 'pantallas/visitantes.dart';
import 'pantallas/zonas.dart';

/// Una lectura por pantalla, todas juntas: es lo que se olvida al cerrar
/// sesión y lo que el ciclo recarga.
class ControladoresDelArmazon {
  ControladoresDelArmazon({
    required RepositorioDelResidente repo,
    required RepositorioDelHogar hogar,
    required RepositorioDeAlta alta,
    required RepositorioDeNotificaciones notificaciones,
    required RepositorioDeMenores menores,
  }) : inicio = controladorDeInicio(repo),
       familia = controladorDeFamilia(repo),
       vehiculos = controladorDeVehiculos(repo),
       autorizaciones = controladorDeAutorizaciones(repo),
       ultimos = controladorDeUltimosVisitantes(repo),
       historial = ControladorDeHistorial(repo),
       zonas = controladorDeZonas(repo),
       perfil = ControladorDeVista<PerfilDelResidente>(leer: hogar.miPerfil),
       ocupantes = ControladorDeVista<MisOcupantes>(leer: alta.misOcupantes),
       menores = ControladorDeVista<List<MenorDelHogar>>(leer: menores.misMenores),
       notificaciones = ControladorDeVista<List<Notificacion>>(
         leer: notificaciones.misNotificaciones,
         estaVacio: (l) => l.isEmpty,
       );

  /// Los del armazón, sobre los puertos de la app.
  factory ControladoresDelArmazon.de(Dependencias d) => ControladoresDelArmazon(
    repo: d.repositorio,
    hogar: d.hogar,
    alta: d.alta,
    notificaciones: d.notificacionesDelConjunto,
    menores: d.menores,
  );

  final ControladorDeVista<MiHogar> inicio;
  final ControladorDeVista<List<MiembroDeFamilia>> familia;
  final ControladorDeVista<List<Vehiculo>> vehiculos;
  final ControladorDeVista<List<Autorizacion>> autorizaciones;
  final ControladorDeVista<List<VisitanteReciente>> ultimos;
  final ControladorDeHistorial historial;
  final ControladorDeVista<List<ZonaComun>> zonas;
  final ControladorDeVista<PerfilDelResidente> perfil;
  final ControladorDeVista<MisOcupantes> ocupantes;

  /// 15-W · los menores del hogar: se leen en «Mi familia».
  final ControladorDeVista<List<MenorDelHogar>> menores;

  /// 15-L · las de la API. Se recargan en TODA vuelta del ciclo, no sólo con
  /// su pantalla abierta: alimentan el contador de Inicio y el de la barra.
  final ControladorDeVista<List<Notificacion>> notificaciones;

  List<ControladorDeVista<Object?>> get todos => [
    inicio,
    familia,
    vehiculos,
    autorizaciones,
    ultimos,
    historial,
    zonas,
    perfil,
    ocupantes,
    menores,
    notificaciones,
  ];

  /// Todo, a la vez: al entrar y tras un cambio de vivienda.
  void cargarTodo() {
    for (final c in todos) {
      unawaited(c.cargarAhora());
    }
  }

  /// Al cerrar la sesión: los datos de una cuenta no se quedan en memoria
  /// para la siguiente.
  void olvidarTodo() {
    for (final c in todos) {
      c.olvidar();
    }
  }

  /// Lo que se ve en cada pestaña. Es lo que el ciclo recarga.
  List<ControladorDeVista<Object?>> dePestana(int pestana) => switch (pestana) {
    0 => [inicio, autorizaciones],
    1 => [autorizaciones, ultimos],
    2 => [vehiculos],
    3 => [zonas],
    _ => [perfil, inicio, ocupantes],
  };
}

class PestanasDelArmazon extends StatelessWidget {
  const PestanasDelArmazon({
    super.key,
    required this.pestana,
    required this.alElegir,
    required this.controladores,
    required this.sinVer,
    required this.pendientes,
    required this.llamador,
    required this.acciones,
    required this.alRecargar,
    required this.alPedirAcceso,
    required this.alCerrarSesion,
    required this.alRegistrarVisita,
    required this.alVolverAAutorizar,
    required this.alReintentarPendientes,
    required this.alAbrirFamilia,
    required this.alAbrirHistorial,
    required this.alAbrirNotificaciones,
    required this.alAbrirOcupantes,
    required this.alRevocarVisita,
  });

  final int pestana;
  final void Function(int) alElegir;
  final ControladoresDelArmazon controladores;
  final ValueListenable<int> sinVer;
  final List<EnvioPendiente> pendientes;
  final LlamadorDeTelefono llamador;
  final AccionesDelHogar acciones;
  final Future<void> Function() alRecargar;
  final void Function() alPedirAcceso;
  final void Function() alCerrarSesion;
  final void Function() alRegistrarVisita;
  final void Function(VisitanteReciente) alVolverAAutorizar;
  final Future<void> Function() alReintentarPendientes;
  final void Function() alAbrirFamilia;
  final void Function() alAbrirHistorial;
  final void Function() alAbrirNotificaciones;
  final void Function() alAbrirOcupantes;
  final void Function(Autorizacion visita) alRevocarVisita;

  Widget _pantalla(BuildContext context) {
    final c = controladores;
    return switch (pestana) {
      0 => PantallaDeInicio(
        controlador: c.inicio,
        autorizaciones: c.autorizaciones,
        alPedirAcceso: alPedirAcceso,
        alRegistrarVisita: alRegistrarVisita,
        alAbrirFamilia: alAbrirFamilia,
        alAbrirHistorial: alAbrirHistorial,
        alAbrirVehiculos: () => alElegir(2),
        sinVer: sinVer,
        alAbrirNotificaciones: alAbrirNotificaciones,
        alRecargar: alRecargar,
      ),
      1 => PantallaDeVisitantes(
        controlador: c.autorizaciones,
        ultimos: c.ultimos,
        alPedirAcceso: alPedirAcceso,
        alCrear: alRegistrarVisita,
        alVolverAAutorizar: alVolverAAutorizar,
        pendientes: pendientes,
        alReintentarPendientes: alReintentarPendientes,
        alRecargar: alRecargar,
        alRevocar: alRevocarVisita,
      ),
      2 => PantallaDeVehiculos(
        controlador: c.vehiculos,
        alPedirAcceso: alPedirAcceso,
        alRegistrar: () => acciones.registrarVehiculo(context),
        alEditar: (v) => acciones.editarVehiculo(context, v),
        alEliminar: (v) => acciones.eliminarVehiculo(context, v),
      ),
      3 => PantallaDeZonas(
        controlador: c.zonas,
        alPedirAcceso: alPedirAcceso,
        alRecargar: alRecargar,
      ),
      _ => PantallaDePerfil(
        controladorDeInicio: c.inicio,
        controladorDePerfil: c.perfil,
        controladorDeOcupantes: c.ocupantes,
        llamador: llamador,
        alCerrarSesion: alCerrarSesion,
        alAbrirFamilia: alAbrirFamilia,
        alAbrirHistorial: alAbrirHistorial,
        alAbrirVehiculos: () => alElegir(2),
        alAbrirNotificaciones: alAbrirNotificaciones,
        alEditarPerfil: (p) => acciones.editarPerfil(context, p),
        alCambiarVivienda: (p) => acciones.cambiarVivienda(context, p),
        alCambiarContrasena: () => acciones.cambiarContrasena(context),
        alAbrirOcupantes: alAbrirOcupantes,
        alRecargar: alRecargar,
      ),
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(child: _pantalla(context)),
      bottomNavigationBar: NavigationBar(
        selectedIndex: pestana,
        onDestinationSelected: alElegir,
        destinations: [
          NavigationDestination(
            // 15-L · lo que no ha visto, también desde las otras pestañas.
            icon: ValueListenableBuilder<int>(
              valueListenable: sinVer,
              builder: (_, n, icono) =>
                  Badge(isLabelVisible: n > 0, label: Text('$n'), child: icono),
              child: const Icon(Icons.home_outlined),
            ),
            label: 'Inicio',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_add_alt_outlined),
            label: 'Visitantes',
          ),
          const NavigationDestination(
            icon: Icon(Icons.directions_car_outlined),
            label: 'Vehículos',
          ),
          const NavigationDestination(icon: Icon(Icons.pool_outlined), label: 'Zonas'),
          const NavigationDestination(icon: Icon(Icons.person_outline), label: 'Perfil'),
        ],
      ),
    );
  }
}
