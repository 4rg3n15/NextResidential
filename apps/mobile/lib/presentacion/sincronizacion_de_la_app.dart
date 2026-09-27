/// 15-L · QUÉ SE RECARGA, CUÁNDO, Y EN QUÉ ORDEN.
///
/// El `CicloDeRecarga` sabe de cuándo (cada 20 s, con retroceso, nunca dos a la
/// vez). Esto le dice QUÉ: la pantalla que está a la vista —la pestaña, o lo
/// que se abrió encima—, las notificaciones (alimentan el contador) y la
/// bandeja de salida. Y en qué ORDEN, que es la condición que el usuario puso
/// por escrito: primero `asegurar()` la sesión —renovar si el token vence
/// pronto—, DESPUÉS pedir.
///
/// Salió del armazón por SRP: el armazón decide qué pantalla se ve y cuándo se
/// pide acceso; esto, cómo se mantiene al día lo que se ve.
library;

import 'dart:async';

import '../aplicacion/ciclo_de_recarga.dart';
import '../aplicacion/estado.dart';
import '../aplicacion/sesion_en_uso.dart';
import '../dominio/causa_de_red.dart';
import 'controlador.dart';
import 'pestanas.dart';

class SincronizacionDeLaApp {
  SincronizacionDeLaApp({
    required SesionEnUso sesion,
    required ControladoresDelArmazon controladores,
    required int Function() pestana,
    required Future<void> Function() vaciarBandeja,
    required void Function() alPerderLaSesion,
    Duration intervalo = const Duration(seconds: 20),
  })  : _sesion = sesion,
        _c = controladores,
        _pestana = pestana,
        _vaciarBandeja = vaciarBandeja,
        _alPerderLaSesion = alPerderLaSesion,
        _intervalo = intervalo;

  final SesionEnUso _sesion;
  final ControladoresDelArmazon _c;
  final int Function() _pestana;
  final Future<void> Function() _vaciarBandeja;
  final void Function() _alPerderLaSesion;
  final Duration _intervalo;

  late final CicloDeRecarga ciclo = CicloDeRecarga(recargar: _recargarVisible, intervalo: _intervalo);

  /// Lo que se ve ENCIMA de las pestañas (familia, historial, notificaciones,
  /// un formulario). `null` = la pestaña.
  List<ControladorDeVista<Object?>>? _encima;

  /// Al volver a primer plano: renovar si toca y DESPUÉS recargar lo visible.
  /// **Siempre** se recarga: antes sólo si el dato tenía más de dos minutos,
  /// y en ese minuto portería pudo haber rechazado una visita.
  Future<void> alVolverAPrimerPlano() async {
    await _sesion.alVolverAPrimerPlano();
    if (!_sesion.haySesion) {
      // El refresco falló: la sesión está muerta y se pide acceso, en vez de
      // dejar en pantalla datos que ya no se pueden recargar.
      _alPerderLaSesion();
      return;
    }
    ciclo.reanudar();
    await ciclo.ahora();
  }

  /// En el bolsillo no hay a quién enseñarle nada: ni batería ni datos.
  void alPasarASegundoPlano() => ciclo.pausar();

  /// Volvió la red: lo pendiente sale YA, sin esperar a la siguiente vuelta.
  void alCambiarDeRed(TipoDeRed red) {
    if (ciclo.activo && red != TipoDeRed.ninguna) unawaited(ciclo.ahora());
  }

  /// Mientras `abrir` está en curso, lo visible es `visibles`: el ciclo recarga
  /// eso y no la pestaña de debajo. Al abrir se recarga en el acto.
  Future<void> conEncima(
    List<ControladorDeVista<Object?>> visibles,
    Future<void> Function() abrir,
  ) async {
    final anterior = _encima;
    _encima = visibles;
    if (visibles.isNotEmpty) unawaited(ciclo.ahora());
    try {
      await abrir();
    } finally {
      _encima = anterior;
    }
  }

  /// Una vuelta: la sesión, la bandeja y lo que se ve, en ese orden.
  Future<bool> _recargarVisible() async {
    final s = await _sesion.asegurar();
    if (s == null) {
      _alPerderLaSesion();
      return true;
    }
    // La bandeja primero: si una visita pendiente sale ahora, la lista que se
    // pide después ya la trae.
    await _vaciarBandeja();
    final visibles = {...(_encima ?? _c.dePestana(_pestana())), _c.notificaciones};
    await Future.wait(visibles.map((c) => c.refrescar()));
    return !visibles.any((c) => c.estado is Fallido);
  }
}
