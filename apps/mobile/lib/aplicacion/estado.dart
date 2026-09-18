/// Los cinco estados de toda vista, como TIPO y no como convención.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// EL HALLAZGO MÁS VOLUMINOSO DE LA AUDITORÍA, RESUELTO UNA VEZ
///
/// `03-mockups.md` §4 lo dice sin adornos: el mockup dibuja **exclusivamente el
/// camino feliz con datos**, y los cinco estados que el contrato exige en toda
/// vista —vacío, cargando, error, sin permiso, sin conexión— están ausentes en
/// las 18 pantallas. «Por cada pantalla del mockup hay entre cinco y nueve
/// estados que diseñar.»
///
/// Con un `bool cargando` y un `String? error` por pantalla, el quinto estado
/// se olvida en la tercera pantalla. Aquí es una **unión sellada**: el
/// `switch` de la interfaz no compila si falta una rama. Dart lo comprueba,
/// no la revisión.
library;

import '../dominio/puertos.dart';

sealed class Estado<T> {
  const Estado();
}

/// Aún no se ha pedido nada. Distinto de `Cargando`: no hay esqueleto que
/// pintar todavía.
class Inicial<T> extends Estado<T> {
  const Inicial();
}

class Cargando<T> extends Estado<T> {
  const Cargando({this.previo});

  /// Lo último bueno, si lo hubo. Permite recargar sin vaciar la pantalla —lo
  /// contrario produce un parpadeo a blanco en cada regreso a primer plano—.
  final T? previo;
}

class ConDatos<T> extends Estado<T> {
  const ConDatos(this.datos, {this.desdeCache = false});
  final T datos;

  /// Sirve para DECIRLO en la pantalla. Un dato viejo presentado como fresco es
  /// peor que ningún dato.
  final bool desdeCache;
}

/// Hay respuesta y está vacía: no es lo mismo que un fallo. «Sin vehículos
/// registrados» es información; «no se pudo cargar» es otra cosa.
class Vacio<T> extends Estado<T> {
  const Vacio();
}

class Fallido<T> extends Estado<T> {
  const Fallido(this.fallo, {this.previo});
  final Fallo fallo;
  final T? previo;
}

/// Ejecuta una lectura y la traduce a estados. **Es el único sitio donde una
/// excepción se convierte en estado**, y por eso los cinco estados no se pueden
/// olvidar en una pantalla: no hay otra forma de cargar datos.
///
/// `estaVacio` se pasa explícitamente porque «vacío» depende del tipo: una
/// lista sin elementos lo está, un hogar nunca.
Future<Estado<T>> cargar<T>(
  Future<T> Function() leer, {
  bool Function(T)? estaVacio,
}) async {
  try {
    final datos = await leer();
    if (estaVacio != null && estaVacio(datos)) return Vacio<T>();
    return ConDatos<T>(datos);
  } on Fallo catch (f) {
    return Fallido<T>(f);
  } catch (e) {
    // Nada sube sin clasificar: un error no previsto se presenta como fallo de
    // servidor con su texto, nunca como una excepción que revienta el árbol de
    // widgets y deja la pantalla en gris.
    return Fallido<T>(Fallo(ClaseDeFallo.servidor, e.toString()));
  }
}
