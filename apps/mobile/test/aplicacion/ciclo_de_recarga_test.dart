import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/ciclo_de_recarga.dart';

/// 15-L · EL CICLO, CON UN RELOJ QUE DECIDE LA PRUEBA.
///
/// El programador falso guarda cada temporizador con su espera y la prueba lo
/// hace vencer cuando quiere: se comprueba el retroceso de 20 s a 2 min sin
/// esperar un solo segundo real.
class ProgramadorFalso {
  final List<TemporizadorFalso> todos = [];

  Temporizador programar(Duration espera, void Function() alVencer) {
    final t = TemporizadorFalso(espera, alVencer);
    todos.add(t);
    return t;
  }

  List<TemporizadorFalso> get activos => todos.where((t) => !t.cancelado && !t.vencido).toList();

  Duration? get proximaEspera => activos.isEmpty ? null : activos.single.espera;

  /// Vence el único temporizador activo y deja correr lo que dispare.
  Future<void> vencer() async {
    final t = activos.single..vencido = true;
    t.alVencer();
    await vaciarMicrotareas();
  }
}

class TemporizadorFalso implements Temporizador {
  TemporizadorFalso(this.espera, this.alVencer);
  final Duration espera;
  final void Function() alVencer;
  bool cancelado = false;
  bool vencido = false;

  @override
  void cancelar() => cancelado = true;
}

Future<void> vaciarMicrotareas() async {
  for (var i = 0; i < 10; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  late ProgramadorFalso reloj;
  late List<bool> respuestas;
  late int vueltas;
  late CicloDeRecarga ciclo;

  CicloDeRecarga nuevo({Duration intervalo = const Duration(seconds: 20)}) => CicloDeRecarga(
        recargar: () async {
          vueltas += 1;
          return respuestas.isEmpty ? true : respuestas.removeAt(0);
        },
        intervalo: intervalo,
        programar: reloj.programar,
      );

  setUp(() {
    reloj = ProgramadorFalso();
    respuestas = [];
    vueltas = 0;
    ciclo = nuevo();
  });

  test('reanudar programa la primera vuelta a los 20 s, y no recarga antes', () {
    ciclo.reanudar();
    expect(ciclo.activo, isTrue);
    expect(reloj.proximaEspera, const Duration(seconds: 20));
    expect(vueltas, 0);
  });

  test('reanudar dos veces no programa dos temporizadores', () {
    ciclo
      ..reanudar()
      ..reanudar();
    expect(reloj.activos, hasLength(1));
  });

  test('al vencer, recarga y programa la siguiente al mismo intervalo', () async {
    ciclo.reanudar();
    await reloj.vencer();
    expect(vueltas, 1);
    expect(reloj.proximaEspera, const Duration(seconds: 20));
    await reloj.vencer();
    expect(vueltas, 2);
  });

  test('ante fallos se espacia 20 → 40 → 80 → 120 s, con tope; al ir bien vuelve a 20', () async {
    respuestas.addAll([false, false, false, false, true]);
    ciclo.reanudar();
    final esperas = <Duration?>[];
    for (var i = 0; i < 5; i++) {
      await reloj.vencer();
      esperas.add(reloj.proximaEspera);
    }
    expect(esperas, const [
      Duration(seconds: 40),
      Duration(seconds: 80),
      Duration(minutes: 2),
      Duration(minutes: 2),
      Duration(seconds: 20),
    ]);
  });

  test('una excepción en la recarga cuenta como fallo y no rompe el ciclo', () async {
    final c = CicloDeRecarga(
      recargar: () async => throw StateError('se cayó'),
      programar: reloj.programar,
    )..reanudar();
    await reloj.vencer();
    expect(c.esperaActual, const Duration(seconds: 40));
    expect(reloj.proximaEspera, const Duration(seconds: 40));
  });

  test('pausar (segundo plano) cancela y no programa más', () async {
    ciclo.reanudar();
    ciclo.pausar();
    expect(ciclo.activo, isFalse);
    expect(reloj.activos, isEmpty);
    await ciclo.ahora();
    expect(vueltas, 1, reason: 'una vuelta pedida a mano sí sale');
    expect(reloj.activos, isEmpty, reason: 'pero no programa la siguiente');
  });

  test('NUNCA DOS VUELTAS A LA VEZ · la segunda espera a la que está en vuelo', () async {
    final enVuelo = Completer<bool>();
    var llamadas = 0;
    final c = CicloDeRecarga(
      recargar: () {
        llamadas += 1;
        return enVuelo.future;
      },
      programar: reloj.programar,
    )..reanudar();

    final primera = c.ahora();
    final segunda = c.ahora();
    expect(identical(primera, segunda), isTrue);
    expect(llamadas, 1);
    expect(reloj.activos, isEmpty, reason: 'con una vuelta en vuelo no se programa otra');

    enVuelo.complete(true);
    await primera;
    expect(llamadas, 1);
    expect(reloj.proximaEspera, const Duration(seconds: 20));
  });

  test('ahora() adelanta la vuelta: cancela el temporizador y reprograma después', () async {
    ciclo.reanudar();
    final primero = reloj.activos.single;
    await ciclo.ahora();
    expect(primero.cancelado, isTrue);
    expect(vueltas, 1);
    expect(reloj.activos, hasLength(1));
  });

  test('el intervalo es configurable', () {
    nuevo(intervalo: const Duration(seconds: 5)).reanudar();
    expect(reloj.proximaEspera, const Duration(seconds: 5));
  });

  test('el programador de verdad usa Timer, y se cancela', () async {
    final vencio = Completer<void>();
    programarConTimer(const Duration(milliseconds: 1), vencio.complete);
    await vencio.future;

    var llamado = false;
    programarConTimer(const Duration(milliseconds: 1), () => llamado = true).cancelar();
    await Future<void>.delayed(const Duration(milliseconds: 5));
    expect(llamado, isFalse);
  });
}
