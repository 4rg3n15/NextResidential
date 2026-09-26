/// La sesión en uso: quién la renueva, cuándo, y una sola vez.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// LAS DOS DECISIONES QUE IMPORTAN
///
/// 1. **El refresco es PROACTIVO.** `asegurar()` se llama al volver a primer
///    plano y antes de cada lectura, y consulta la política pura del dominio.
///    Ninguna petición sale con un token que ya se sabía vencido. El 401 sigue
///    tratándose, pero como excepción —un token revocado en el servidor—, no
///    como el mecanismo de renovación.
///
/// 2. **Un solo refresco a la vez.** Cuatro pantallas pidiendo datos al
///    reanudar producen cuatro `asegurar()` simultáneos. Sin la promesa
///    compartida de abajo, eso son cuatro renovaciones con el mismo token de
///    refresco; Supabase rota el token en cada uso, así que la primera invalida
///    a las otras tres y el residente acaba fuera. Es el modo de fallo que
///    convierte «refresqué al volver» en «me echó al volver».
library;

import 'dart:async';

import '../dominio/acceso.dart';
import '../dominio/puertos.dart';
import '../dominio/sesion.dart';

class SesionEnUso {
  SesionEnUso({
    required AlmacenDeSesion almacen,
    required Autenticador autenticador,
    required Reloj reloj,
  })  : _almacen = almacen,
        _autenticador = autenticador,
        _reloj = reloj;

  final AlmacenDeSesion _almacen;
  final Autenticador _autenticador;
  final Reloj _reloj;

  Sesion? _sesion;
  DateTime? _ultimoUso;
  Future<Sesion?>? _renovacionEnCurso;

  Sesion? get sesion => _sesion;
  bool get haySesion => _sesion != null;

  /// Carga desde el almacén seguro al arrancar.
  Future<void> recuperar() async {
    _sesion = await _almacen.leer();
    _ultimoUso = await _almacen.ultimoUso();
  }

  Future<Sesion> iniciar({
    required IdentificadorDeAcceso identificador,
    required String clave,
  }) async {
    final s = await _autenticador.iniciarSesion(identificador, clave: clave);
    await _fijar(s);
    return s;
  }

  /// ADR-023 · tras cambiar la contraseña, el token vigente sigue llevando el
  /// indicador: se renueva para que el gancho de la base emita uno sin él.
  Future<Sesion?> renovarTrasCambio() => _renovarUnaVez();

  Future<void> cerrar() async {
    _sesion = null;
    _ultimoUso = null;
    await _almacen.borrar();
  }

  /// Devuelve una sesión utilizable, renovándola si toca. `null` significa que
  /// hay que pedir credenciales.
  Future<Sesion?> asegurar() async {
    final accion = accionPara(_sesion, _reloj.ahora(), ultimoUso: _ultimoUso);
    switch (accion) {
      case AccionDeSesion.servir:
        return _sesion;
      case AccionDeSesion.pedirAcceso:
        if (_sesion != null) await cerrar();
        return null;
      case AccionDeSesion.renovar:
        return _renovarUnaVez();
    }
  }

  /// Llamado por el observador del ciclo de vida. Devuelve `true` si renovó,
  /// para que la interfaz pueda recargar lo que estuviera en pantalla.
  Future<bool> alVolverAPrimerPlano() async {
    if (!debeRenovarAlVolver(_sesion, _reloj.ahora(), ultimoUso: _ultimoUso)) return false;
    await _renovarUnaVez();
    return true;
  }

  /// Fuerza una renovación tras un 401 inesperado: el token pudo revocarse
  /// mientras la app estaba en primer plano y la política no puede saberlo.
  Future<Sesion?> renovarPorRechazo() => _renovarUnaVez();

  Future<Sesion?> _renovarUnaVez() {
    // La promesa compartida: quien llegue mientras hay una renovación en curso
    // espera a ESA, no arranca otra.
    return _renovacionEnCurso ??= _renovar().whenComplete(() {
      _renovacionEnCurso = null;
    });
  }

  Future<Sesion?> _renovar() async {
    final actual = _sesion;
    if (actual == null) return null;
    try {
      final renovada = await _autenticador.renovar(actual);
      await _fijar(renovada);
      return renovada;
    } on Fallo {
      // Un refresco rechazado no se reintenta: el token de refresco se rota en
      // cada uso, así que insistir con el mismo no puede funcionar y solo
      // retrasa la pantalla de acceso.
      await cerrar();
      return null;
    }
  }

  Future<void> _fijar(Sesion s) async {
    _sesion = s;
    _ultimoUso = _reloj.ahora();
    await _almacen.guardar(s, ultimoUso: _ultimoUso!);
  }
}
