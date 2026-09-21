/// M-7 · HU-34 · el registro del aparato para recibir avisos, como máquina.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// POR QUÉ ESTO NO ES UN `bool`
///
/// «Notificaciones activadas» suena a interruptor y son tres condiciones
/// independientes, cada una con su modo de fallar:
///
///   1. el permiso del sistema operativo,
///   2. un token del servicio de mensajería,
///   3. ese token **registrado en el conjunto**.
///
/// Un interruptor las colapsa y deja al residente creyendo que le avisarán
/// cuando llegue su visitante. Las tres se distinguen aquí y la pantalla las
/// pinta distinto.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// EL REGISTRO SE REINTENTA AL VOLVER A PRIMER PLANO
///
/// El token de FCM rota solo: caduca, cambia al reinstalar, cambia al restaurar
/// una copia de seguridad. Un registro que solo ocurriera cuando el residente
/// abre esta pantalla dejaría de funcionar en silencio el día que rote, y nadie
/// se enteraría hasta que un visitante esperara en la portería. Por eso
/// `asegurarRegistro()` se llama también desde el armazón, y por eso reenvía
/// cuando el token leído difiere del último que se registró.
///
/// Un fallo de red aquí **no** se convierte en `permisoNegado` ni en `sinToken`:
/// es `sinRegistrar` con su detalle. Confundirlos haría que la app le pidiera al
/// residente que volviera a dar un permiso que ya dio.
library;

import 'package:flutter/foundation.dart';

import '../dominio/entidades.dart';
import '../dominio/puertos.dart';
import '../presentacion/pantallas/notificaciones.dart';

class ControladorDeAvisos extends ChangeNotifier {
  ControladorDeAvisos({
    required FuenteDeNotificaciones fuente,
    required RepositorioDelResidente repositorio,
    required Reloj reloj,
  })  : _fuente = fuente,
        _repo = repositorio,
        _reloj = reloj;

  final FuenteDeNotificaciones _fuente;
  final RepositorioDelResidente _repo;
  final Reloj _reloj;

  EstadoDeAvisos _estado = EstadoDeAvisos.sinDeterminar;
  EstadoDeAvisos get estado => _estado;

  DateTime? _ultimoRegistro;
  DateTime? get ultimoRegistro => _ultimoRegistro;

  String? _detalle;
  String? get detalleDelFallo => _detalle;

  /// El último token que el servidor confirmó. Se compara para no reenviar el
  /// mismo en cada arranque y, sobre todo, para reenviar cuando rote.
  String? _registrado;

  /// El residente pulsa «Activar». Es el único camino que pide permiso: pedirlo
  /// al arrancar gasta la única oportunidad que da el sistema operativo antes de
  /// que el residente sepa para qué sirve.
  Future<void> activar() async {
    final concedido = await _fuente.pedirPermiso();
    if (!concedido) {
      _pasarA(EstadoDeAvisos.permisoNegado);
      return;
    }
    await asegurarRegistro();
  }

  /// Se llama al entrar y al volver a primer plano. **No pide permiso**: si no
  /// lo hay, lo dice y espera.
  Future<void> asegurarRegistro() async {
    final aparato = await _fuente.aparato();
    if (aparato == null) {
      // Sin token no se puede distinguir «el residente dijo que no» de «el
      // servicio no respondió» desde aquí, y son cosas distintas: la primera la
      // resuelve el residente en los ajustes del teléfono y la segunda no la
      // resuelve nadie. Se conserva `permisoNegado` si ya se sabía.
      if (_estado != EstadoDeAvisos.permisoNegado) _pasarA(EstadoDeAvisos.sinToken);
      return;
    }
    if (aparato.token == _registrado && _estado == EstadoDeAvisos.registrado) return;
    await _registrar(aparato);
  }

  /// El residente pulsa «Reintentar» tras un fallo de registro.
  Future<void> reintentar() async {
    final aparato = await _fuente.aparato();
    if (aparato == null) {
      _pasarA(EstadoDeAvisos.sinToken);
      return;
    }
    await _registrar(aparato);
  }

  Future<void> _registrar(AparatoDeNotificaciones aparato) async {
    try {
      await _repo.registrarAparato(aparato);
      _registrado = aparato.token;
      _ultimoRegistro = _reloj.ahora();
      _pasarA(EstadoDeAvisos.registrado);
    } on Fallo catch (f) {
      // Un 401 mata la sesión y lo resuelve el armazón; aquí solo se anota que
      // el aparato NO está registrado, que es la verdad que el residente
      // necesita ver.
      _detalle = f.detalle;
      _pasarA(EstadoDeAvisos.sinRegistrar, conservarDetalle: true);
    }
  }

  /// Al cerrar sesión. El token pertenece al aparato, pero el registro pertenece
  /// a la cuenta: dejarlo marcado como registrado haría que la cuenta siguiente
  /// en el mismo teléfono no volviera a registrarse.
  void olvidar() {
    _registrado = null;
    _ultimoRegistro = null;
    _detalle = null;
    _pasarA(EstadoDeAvisos.sinDeterminar);
  }

  void _pasarA(EstadoDeAvisos nuevo, {bool conservarDetalle = false}) {
    _estado = nuevo;
    if (!conservarDetalle) _detalle = null;
    notifyListeners();
  }
}
