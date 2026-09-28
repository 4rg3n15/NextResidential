/// Qué notificaciones ya vio el residente EN ESTE TELÉFONO.
///
/// Es lo único de las notificaciones que vive en el aparato, y a propósito: la
/// lista es de la API y la comparte la consola; «ya la vi» es estado de esta
/// pantalla en este teléfono (ver `dominio/notificaciones.dart`). Se guarda
/// para que el contador de Inicio no vuelva a sumar lo ya visto tras cerrar la
/// app.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../dominio/notificaciones.dart';
import '../dominio/puertos.dart';

class NotificacionesVistas extends ChangeNotifier {
  NotificacionesVistas({required AlmacenDeTexto almacen}) : _almacen = almacen;

  static const clave = 'ncr.notificaciones.vistas';
  final AlmacenDeTexto _almacen;
  Set<String> _vistas = const {};

  Future<void> recuperar() async {
    try {
      final crudo = await _almacen.leer(clave);
      final lista = crudo == null ? null : jsonDecode(crudo);
      if (lista is List) _vistas = lista.whereType<String>().toSet();
    } on Object {
      // Ilegible: nada visto. Lo peor que pasa es un contador de más.
    }
  }

  int sinVer(List<Notificacion> lista) => cuantasSinVer(lista, _vistas);

  /// Abrir la pantalla las marca TODAS como vistas. Lo guardado son los
  /// identificadores de la lista de ahora, no la unión con los de antes: así
  /// no crece sin límite (la API devuelve las de los últimos 30 días).
  Future<void> marcar(List<Notificacion> lista) async {
    final ids = lista.map((n) => n.id).toSet();
    if (setEquals(ids, _vistas)) return;
    _vistas = ids;
    notifyListeners();
    try {
      await _almacen.escribir(clave, jsonEncode(ids.toList()));
    } on Object {
      // Sin llavero, se recuerda mientras la app esté abierta.
    }
  }
}
