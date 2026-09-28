/// El almacén de texto del aparato: Keychain en iOS, Keystore en Android.
///
/// Guarda la dirección del servidor, las notificaciones vistas y la bandeja de
/// salida. Va al llavero y no a `SharedPreferences` por la bandeja: lleva la
/// foto de un visitante hasta que el conjunto la recibe, y eso no se deja en un
/// XML legible con una copia de seguridad sin cifrar (Ley 1581).
///
/// En web no hay llavero: se usa el de memoria, igual que la sesión, y se
/// declara en `main.dart` en vez de fingir uno.
library;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../dominio/puertos.dart';

class AlmacenDeTextoSeguro implements AlmacenDeTexto {
  AlmacenDeTextoSeguro({FlutterSecureStorage? almacen})
    : _almacen =
          almacen ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
          );

  final FlutterSecureStorage _almacen;

  @override
  Future<String?> leer(String clave) => _almacen.read(key: clave);

  @override
  Future<void> escribir(String clave, String valor) => _almacen.write(key: clave, value: valor);

  @override
  Future<void> borrar(String clave) => _almacen.delete(key: clave);
}

/// En memoria: el recorrido web y las pruebas. Una prueba que quiere simular
/// «cerrar y volver a abrir la app» construye la app otra vez con ESTE mismo
/// objeto, que hace de llavero.
class AlmacenDeTextoEnMemoria implements AlmacenDeTexto {
  final Map<String, String> datos = {};

  @override
  Future<String?> leer(String clave) async => datos[clave];

  @override
  Future<void> escribir(String clave, String valor) async => datos[clave] = valor;

  @override
  Future<void> borrar(String clave) async => datos.remove(clave);
}
