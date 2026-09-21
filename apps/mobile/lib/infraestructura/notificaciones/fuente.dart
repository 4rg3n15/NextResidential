/// De dónde salen el identificador del aparato y el token de mensajería.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// QUÉ ESTÁ CONSTRUIDO Y QUÉ NO · declarado, no disimulado
///
/// De las tres piezas del aviso push, aquí hay **dos**:
///
///   · el `instalacionId`, que la app genera UNA vez y guarda en el llavero, y
///   · el registro contra el conjunto, que ya existe (`POST mi/dispositivos`,
///     migración 0030) con su prueba de aislamiento.
///
/// Falta la tercera: el token, que lo emite Firebase Cloud Messaging. Añadir
/// `firebase_messaging` exige `google-services.json` y `GoogleService-Info.plist`
/// del proyecto de Grupo Control, que §2.5 prohíbe versionar y que todavía no
/// existe. Así que el adaptador real llega cuando el proyecto de Firebase esté
/// aprovisionado, y hasta entonces `SinServicioDeMensajeria` devuelve `null`.
///
/// **`null` no es un fallo disfrazado**: la máquina de estados lo traduce a
/// `sinToken` y la pantalla lo dice con esas palabras. Lo que no hace es
/// enseñarle al residente un interruptor encendido, que es la única forma de
/// equivocarse aquí: creer que le avisarán cuando llegue su visitante.
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

/// El adaptador mientras Firebase no esté aprovisionado.
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
