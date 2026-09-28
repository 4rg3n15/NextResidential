/// EL CICLO QUE MANTIENE LA APP AL DÍA CON LA CONSOLA.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LO QUE PIDIÓ EL CLIENTE
///
/// «La información de la app debe sincronizarse con la de la consola web,
/// porque ambas comparten información.» Las dos leen la MISMA API; lo que
/// faltaba era que la app volviera a preguntar. Si portería rechaza una visita
/// desde la consola, la tarjeta del residente tiene que decir «Rechazada» sin
/// que él toque nada.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LAS CUATRO REGLAS
///
/// 1. **Cada 20 s mientras la app está en primer plano** (configurable). En
///    segundo plano se detiene: no hay a quién enseñarle nada, y un teléfono
///    en el bolsillo no debe gastar batería ni datos preguntando.
/// 2. **Retroceso exponencial ante fallos, con tope** (20 → 40 → 80 → 120 s).
///    Sin red, preguntar cada 20 s no la trae antes; y mil teléfonos
///    insistiendo a la vez tras una caída son justo lo que el limitador del
///    servidor rechaza.
/// 3. **Nunca dos vueltas a la vez.** Si la anterior no terminó, la siguiente
///    no sale: se espera a la que está en vuelo.
/// 4. **El temporizador se inyecta.** Una prueba que esperase 20 s de verdad
///    no se escribiría; con el programador inyectado, la prueba decide cuándo
///    vence.
///
/// Qué se recarga en cada vuelta —la pantalla visible, la bandeja de salida,
/// las notificaciones— y en qué orden —renovar la sesión y DESPUÉS pedir— lo
/// decide quien construye el ciclo: esto sólo sabe de cuándo.
library;

import 'dart:async';
import 'dart:math';

/// Lo mínimo de un temporizador: poder cancelarlo.
abstract interface class Temporizador {
  void cancelar();
}

/// Programa `alVencer` para dentro de `espera`.
typedef Programar = Temporizador Function(Duration espera, void Function() alVencer);

/// El programador de verdad, sobre `Timer`. En una prueba de widget ese
/// `Timer` es el del reloj falso del banco, que avanza con `pump(Duration)`.
Temporizador programarConTimer(Duration espera, void Function() alVencer) =>
    _TemporizadorDeTimer(Timer(espera, alVencer));

class _TemporizadorDeTimer implements Temporizador {
  _TemporizadorDeTimer(this._timer);
  final Timer _timer;
  @override
  void cancelar() => _timer.cancel();
}

class CicloDeRecarga {
  CicloDeRecarga({
    required Future<bool> Function() recargar,
    this.intervalo = const Duration(seconds: 20),
    this.tope = const Duration(minutes: 2),
    Programar programar = programarConTimer,
  })  : _recargar = recargar,
        _programarCon = programar,
        _espera = intervalo;

  /// Devuelve `true` si todo cargó; `false` (o una excepción) cuenta como
  /// fallo y alarga la espera siguiente.
  final Future<bool> Function() _recargar;
  final Programar _programarCon;

  final Duration intervalo;
  final Duration tope;

  Duration _espera;
  bool _activo = false;
  Temporizador? _temporizador;
  Future<void>? _enCurso;

  bool get activo => _activo;

  /// Cuánto falta, como mucho, para la próxima vuelta.
  Duration get esperaActual => _espera;

  /// Primer plano: el ciclo corre.
  void reanudar() {
    if (_activo) return;
    _activo = true;
    _programar();
  }

  /// Segundo plano o sin sesión: el ciclo se detiene. Una vuelta en vuelo
  /// termina, pero no programa la siguiente.
  void pausar() {
    _activo = false;
    _temporizador?.cancelar();
    _temporizador = null;
  }

  /// Una vuelta YA —al volver a primer plano, al tirar hacia abajo, al
  /// recuperar la red—. Si hay una en vuelo, se devuelve esa: no sale otra.
  Future<void> ahora() {
    _temporizador?.cancelar();
    _temporizador = null;
    return _enCurso ??= _vuelta();
  }

  Future<void> _vuelta() async {
    bool bien;
    try {
      bien = await _recargar();
    } on Object {
      bien = false;
    }
    _espera = bien ? intervalo : _siguiente(_espera);
    _enCurso = null;
    _programar();
  }

  Duration _siguiente(Duration actual) {
    final doble = actual * 2;
    return Duration(microseconds: min(doble.inMicroseconds, tope.inMicroseconds));
  }

  void _programar() {
    _temporizador?.cancelar();
    _temporizador = null;
    if (!_activo || _enCurso != null) return;
    _temporizador = _programarCon(_espera, _alVencer);
  }

  void _alVencer() {
    _temporizador = null;
    if (_activo) unawaited(ahora());
  }
}
