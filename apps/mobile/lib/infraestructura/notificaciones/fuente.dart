/// De dónde salen el identificador del aparato y el token de mensajería.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// ADR-036 (15-R, P-23) · ESTA APP NO LLEVA SERVICIO DE PUSH, Y ES DEFINITIVO
///
/// El cliente decidió avisos SIN Firebase: llegan por Web Push estándar a la
/// consola del residente instalada como PWA. La app (APK firmado por descarga
/// en Android; en iPhone sólo la PWA) no incluye `firebase_messaging` ni ningún
/// SDK de push de Google o Apple, y por tanto no necesita `google-services.json`
/// ni `GoogleService-Info.plist`. `SinServicioDeMensajeria` no es un adaptador
/// provisional: es EL adaptador.
///
/// Lo que sí hay: el `instalacionId` estable en el llavero (por si un día se
/// decide otra cosa, no habrá que inventar uno), y la bandeja, que lee
/// `GET mi/notificaciones` y se recarga cada 20 s mientras la app está abierta
/// (`CicloDeRecarga`). **`null` no es un fallo disfrazado**: nada promete al
/// residente un aviso con la app cerrada; la pantalla dice «Los avisos llegan
/// mientras la app está abierta».
library;

import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../dominio/entidades.dart';
import '../../dominio/puertos.dart';

/// El identificador ESTABLE del aparato, guardado en el llavero.
///
/// Se guarda aquí y no en `SharedPreferences` por una razón concreta: al
/// desinstalar, el llavero de iOS conserva sus entradas y las preferencias no.
/// Conservarlo es lo correcto —el aparato sigue siendo el mismo—, y de paso
/// evita que una reinstalación deje una fila huérfana en el servidor a la que
/// se siga notificando.
class IdentidadDelAparato {
  IdentidadDelAparato({FlutterSecureStorage? almacen})
      : _almacen = almacen ?? const FlutterSecureStorage();

  static const _clave = 'ncr.instalacion_id';
  final FlutterSecureStorage _almacen;

  Future<String> leerOCrear() async {
    final guardado = await _almacen.read(key: _clave);
    if (guardado != null && guardado.isNotEmpty) return guardado;
    final nuevo = _identificador();
    await _almacen.write(key: _clave, value: nuevo);
    return nuevo;
  }

  /// No es un UUID v4 criptográfico y no necesita serlo: no autentica nada —el
  /// servidor deriva la identidad del JWT— y solo tiene que no colisionar entre
  /// los aparatos de un mismo residente.
  static String _identificador() {
    final azar = Random.secure();
    final bytes = List<int>.generate(16, (_) => azar.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}

/// El adaptador de esta app: sin servicio de mensajería (ADR-036).
class SinServicioDeMensajeria implements FuenteDeNotificaciones {
  SinServicioDeMensajeria({required IdentidadDelAparato identidad}) : _identidad = identidad;

  final IdentidadDelAparato _identidad;

  /// Se concede: el permiso del sistema no depende de que haya token, y
  /// devolver `false` haría creer al residente que él dijo que no.
  @override
  Future<bool> pedirPermiso() async => true;

  @override
  Future<AparatoDeNotificaciones?> aparato() async {
    // El identificador se crea igual, para que el día que llegue el token no
    // haya que inventar uno nuevo y duplicar el registro del aparato.
    await _identidad.leerOCrear();
    return null;
  }
}
