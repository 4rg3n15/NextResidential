/// A qué servidor habla la app, y cómo se cambia sin recompilar.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// UNA SOLA FUENTE, MUTABLE
///
/// Los `Dio` de la app se creaban una vez en `main` con la dirección compilada
/// fija. Aquí la dirección es un `ValueListenable<String>`: los `Dio` que hablan
/// con la API (el de las lecturas y el del acceso) la siguen, y cambiarla los
/// cambia a todos a la vez. El `Dio` de la renovación NO la sigue: habla con el
/// proveedor de identidad (`SUPABASE_URL`), que es otra cosa.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LA GUARDADA GANA A LA COMPILADA, Y CAMBIARLA CIERRA LA SESIÓN
///
/// Al arrancar manda la dirección guardada; la compilada es el valor inicial.
/// Cambiar de servidor cierra la sesión porque la sesión ES de un servidor: sus
/// tokens y su copropiedad no significan nada en otro.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../dominio/direccion_del_servidor.dart';
import '../dominio/puertos.dart';
import 'sesion_en_uso.dart';

class DireccionDelServidor extends ChangeNotifier implements ValueListenable<String> {
  DireccionDelServidor({required this.compilada, required AlmacenDeTexto almacen})
      : _almacen = almacen,
        _actual = compilada;

  static const clave = 'ncr.servidor';

  /// La de `--dart-define=API_URL=…`: el valor inicial.
  final String compilada;
  final AlmacenDeTexto _almacen;
  String _actual;

  String get actual => _actual;

  @override
  String get value => _actual;

  bool get esLaCompilada => _actual == compilada;

  /// Al arrancar: si hay una guardada y sigue siendo admisible, manda ésa.
  ///
  /// `[SUPUESTO]` S-91 · La guardada se asocia a la compilada con la que se guardó y
  /// se descarta si la app se instala con OTRA `API_URL`. El llavero de iOS
  /// sobrevive a la desinstalación: sin esto, reinstalar con una dirección
  /// nueva no tendría efecto y nadie sabría por qué.
  Future<void> recuperar() async {
    try {
      final crudo = await _almacen.leer(clave);
      if (crudo == null) return;
      final j = jsonDecode(crudo);
      if (j is! Map || j['compilada'] != compilada || j['url'] is! String) return;
      final revisada = revisarDireccion(j['url'] as String);
      if (revisada is DireccionAceptada) _actual = revisada.url;
    } on Object {
      // Ilegible: se queda la compilada, que es lo que había antes de guardar.
    }
  }

  Future<void> fijar(String url) async {
    await _almacen.escribir(clave, jsonEncode({'url': url, 'compilada': compilada}));
    _actual = url;
    notifyListeners();
  }

  Future<void> restablecer() async {
    await _almacen.borrar(clave);
    _actual = compilada;
    notifyListeners();
  }
}

/// Lo que devuelve un intento de cambiar de servidor.
sealed class ResultadoDeCambio {
  const ResultadoDeCambio();
}

class ServidorCambiado extends ResultadoDeCambio {
  const ServidorCambiado(this.url, {required this.cerroSesion});
  final String url;

  /// `true` si había sesión y se cerró: la pantalla lo dice.
  final bool cerroSesion;
}

class ServidorRechazado extends ResultadoDeCambio {
  const ServidorRechazado(this.motivo);
  final String motivo;
}

/// El caso de uso: revisar, PROBAR, guardar y cerrar la sesión. En ese orden.
class CambioDeServidor {
  CambioDeServidor({
    required this.direccion,
    required ComprobadorDeServidor comprobador,
    required SesionEnUso sesion,
  })  : _comprobador = comprobador,
        _sesion = sesion;

  final DireccionDelServidor direccion;
  final ComprobadorDeServidor _comprobador;
  final SesionEnUso _sesion;

  /// Sólo una dirección que contesta `/health` como Next Control se guarda:
  /// guardar una que no responde dejaría la app sin servidor hasta que alguien
  /// supiera volver aquí.
  Future<ResultadoDeCambio> cambiar(String entrada) async {
    final String url;
    switch (revisarDireccion(entrada)) {
      case DireccionRechazada(motivo: final m):
        return ServidorRechazado(m);
      case DireccionAceptada(url: final u):
        url = u;
    }
    final salud = await _comprobador.comprobar(url);
    if (salud != SaludDelServidor.responde) return ServidorRechazado(mensajeDeSalud(salud));
    if (url == direccion.actual) return ServidorCambiado(url, cerroSesion: false);
    final habia = _sesion.haySesion;
    // Primero se cierra la sesión y DESPUÉS se avisa del cambio: quien escucha
    // la dirección (el armazón) vuelve a la pantalla de acceso, y no puede
    // encontrarse una sesión del servidor anterior todavía abierta.
    await _sesion.cerrar();
    await direccion.fijar(url);
    return ServidorCambiado(url, cerroSesion: habia);
  }

  /// Vuelve a la dirección con que se instaló la app. No se prueba antes: es
  /// la salida de emergencia, y tiene que funcionar aunque no haya red.
  Future<void> restablecer() async {
    if (direccion.esLaCompilada) return;
    await _sesion.cerrar();
    await direccion.restablecer();
  }
}
