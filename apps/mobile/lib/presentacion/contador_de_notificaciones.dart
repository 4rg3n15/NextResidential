/// Cuántas notificaciones no ha visto el residente: el número de Inicio y de
/// la barra.
///
/// Junta la lista de la API (el controlador, que el ciclo recarga) con lo que
/// este teléfono recuerda como visto (`NotificacionesVistas`). Con la pantalla
/// de notificaciones abierta, lo que llega se da por visto: el residente lo
/// está leyendo, y el número no puede subirle debajo de los ojos.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../aplicacion/estado.dart';
import '../aplicacion/notificaciones_vistas.dart';
import '../dominio/notificaciones.dart';
import 'controlador.dart';

class ContadorDeNotificaciones extends ValueNotifier<int> {
  ContadorDeNotificaciones({
    required ControladorDeVista<List<Notificacion>> controlador,
    required NotificacionesVistas vistas,
  }) : _controlador = controlador,
       _vistas = vistas,
       super(0) {
    _controlador.addListener(_actualizar);
    _vistas.addListener(_actualizar);
  }

  final ControladorDeVista<List<Notificacion>> _controlador;
  final NotificacionesVistas _vistas;
  bool _abierta = false;

  /// Lo que ya se vio antes de cerrar la app.
  Future<void> recuperar() async {
    await _vistas.recuperar();
    _actualizar();
  }

  /// La pantalla se abre (`true`) o se cierra (`false`). Al abrirla, lo que ya
  /// está en la lista se da por visto.
  set abierta(bool valor) {
    _abierta = valor;
    _actualizar();
  }

  List<Notificacion> get _lista =>
      switch (_controlador.estado) {
        ConDatos(datos: final d) => d,
        Cargando(previo: final p) => p,
        Fallido(previo: final p) => p,
        _ => null,
      } ??
      const <Notificacion>[];

  void _actualizar() {
    final lista = _lista;
    if (_abierta && lista.isNotEmpty) unawaited(_vistas.marcar(lista));
    value = _vistas.sinVer(lista);
  }

  @override
  void dispose() {
    _controlador.removeListener(_actualizar);
    _vistas.removeListener(_actualizar);
    super.dispose();
  }
}
