/// La sesión, en Keychain (iOS) y Keystore (Android).
///
/// ─────────────────────────────────────────────────────────────────────────────
/// POR QUÉ NO `SharedPreferences`
///
/// `SharedPreferences` es un XML en el almacenamiento de la app y un `plist` en
/// iOS: en un dispositivo con root o con copia de seguridad sin cifrar, el
/// token de refresco sale en texto claro. Ese token vale 30 días y renueva
/// solo, así que quien lo copia tiene la sesión del residente sin su
/// contraseña. Keychain y Keystore lo guardan respaldados por el hardware del
/// dispositivo cuando existe.
///
/// **En web no hay Keychain**, y eso importa porque el recorrido de esta etapa
/// se hace con `flutter build web`. `flutter_secure_storage` cae ahí a
/// `localStorage` con una clave derivada, que es *menos* seguro. El adaptador
/// lo declara en vez de esconderlo: la app de producción es iOS y Android, y el
/// destino web es una superficie de prueba.
library;

import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../dominio/puertos.dart';
import '../../dominio/sesion.dart';

class AlmacenSeguroDeSesion implements AlmacenDeSesion {
  AlmacenSeguroDeSesion({FlutterSecureStorage? almacen})
    : _almacen =
          almacen ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
          );

  final FlutterSecureStorage _almacen;

  static const _clave = 'ncr.sesion';
  static const _claveUltimoUso = 'ncr.sesion.ultimo_uso';

  @override
  Future<Sesion?> leer() async {
    final crudo = await _almacen.read(key: _clave);
    if (crudo == null) return null;
    try {
      final j = jsonDecode(crudo) as Map<String, dynamic>;
      return Sesion(
        tokenDeAcceso: j['acceso'] as String,
        tokenDeRefresco: j['refresco'] as String,
        expiraEn: DateTime.parse(j['expira'] as String),
        usuarioId: j['usuario'] as String,
        copropiedadId: j['copropiedad'] as String?,
        correo: j['correo'] as String,
        // 15-I · ausente en los registros anteriores: no hay cambio pendiente.
        debeCambiarContrasena: j['cambio'] == true,
      );
    } catch (_) {
      // Un registro corrupto se descarta en silencio y se pide acceso. Dejarlo
      // provocaría el mismo error en cada arranque y la app sería inusable sin
      // reinstalar.
      await borrar();
      return null;
    }
  }

  @override
  Future<void> guardar(Sesion sesion, {required DateTime ultimoUso}) async {
    await _almacen.write(
      key: _clave,
      value: jsonEncode({
        'acceso': sesion.tokenDeAcceso,
        'refresco': sesion.tokenDeRefresco,
        'expira': sesion.expiraEn.toIso8601String(),
        'usuario': sesion.usuarioId,
        'copropiedad': sesion.copropiedadId,
        'correo': sesion.correo,
        'cambio': sesion.debeCambiarContrasena,
      }),
    );
    await _almacen.write(key: _claveUltimoUso, value: ultimoUso.toIso8601String());
  }

  @override
  Future<DateTime?> ultimoUso() async {
    final crudo = await _almacen.read(key: _claveUltimoUso);
    return crudo == null ? null : DateTime.tryParse(crudo);
  }

  @override
  Future<void> borrar() async {
    await _almacen.delete(key: _clave);
    await _almacen.delete(key: _claveUltimoUso);
  }
}

/// Almacén en memoria, para el recorrido web y las pruebas.
///
/// Está aquí y no en `test/` porque el recorrido del navegador lo usa: en web
/// no hay Keychain, y fingir que lo hay sería peor que decirlo.
class AlmacenEnMemoria implements AlmacenDeSesion {
  Sesion? _sesion;
  DateTime? _ultimoUso;

  @override
  Future<Sesion?> leer() async => _sesion;

  @override
  Future<void> guardar(Sesion sesion, {required DateTime ultimoUso}) async {
    _sesion = sesion;
    _ultimoUso = ultimoUso;
  }

  @override
  Future<DateTime?> ultimoUso() async => _ultimoUso;

  @override
  Future<void> borrar() async {
    _sesion = null;
    _ultimoUso = null;
  }
}
