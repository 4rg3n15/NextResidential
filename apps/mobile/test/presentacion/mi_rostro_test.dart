/// 15-X (D2) · «Mi rostro»: lo que se ve, lo que hace falta para registrar,
/// el retiro con confirmación y lo que pasa sin conexión —la foto se descarta
/// y no se guarda nada—. La invitación del primer ingreso, en
/// `oferta_del_rostro_test.dart`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/rostro.dart';
import 'package:ncr_residente/presentacion/pantallas/mi_rostro.dart';

import '../dobles/rostro_falso.dart';
import '../dobles/visitas.dart';

void main() {
  void lienzoGrande(WidgetTester t) {
    t.view.physicalSize = const Size(1000, 2800);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
  }

  Future<void> montar(WidgetTester t, RostroFalso rostro) async {
    lienzoGrande(t);
    await t.pumpWidget(
      MaterialApp(
        home: PantallaDeMiRostro(rostro: rostro, tomarFoto: (_) async => fotoTomada(medidasBuenas)),
      ),
    );
    await t.pumpAndSettle();
  }

  bool habilitado(WidgetTester t) =>
      t.widget<FilledButton>(find.byKey(const Key('rostro.registrar'))).onPressed != null;

  Future<void> tomarYAceptar(WidgetTester t) async {
    await t.tap(find.byKey(const Key('foto.tomar')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('rostro.acepto')));
    await t.pumpAndSettle();
  }

  testWidgets('sin rostro: el estado, cada equipo y la política que mandó el servidor', (t) async {
    await montar(t, RostroFalso());
    expect(find.textContaining('Es opcional'), findsOneWidget);
    expect(find.text('Terminal de la portería'), findsOneWidget);
    expect(find.text('Autorizo…'), findsOneWidget);
    expect(find.byKey(const Key('rostro.retirar')), findsNothing);
  });

  testWidgets('sin foto que sirva o sin aceptar la política, no se registra', (t) async {
    await montar(t, RostroFalso());
    expect(habilitado(t), isFalse);
    await t.tap(find.byKey(const Key('foto.tomar')));
    await t.pumpAndSettle();
    expect(habilitado(t), isFalse, reason: 'falta aceptar la política');
    await t.tap(find.byKey(const Key('rostro.acepto')));
    await t.pumpAndSettle();
    expect(habilitado(t), isTrue);
  });

  testWidgets('registra con la versión de la política que MOSTRÓ, y pinta el estado', (t) async {
    final rostro = RostroFalso();
    await montar(t, rostro);
    await tomarYAceptar(t);
    await t.tap(find.byKey(const Key('rostro.registrar')));
    await t.pumpAndSettle();
    expect(rostro.registros.single.$2, RostroFalso.politica.version);
    expect(find.textContaining('los 2 equipos'), findsOneWidget);
    expect(find.text('Listo: su rostro quedó registrado.'), findsOneWidget);
    // Ya hay rostro: se ofrece renovar y retirar.
    expect(find.text('Renovar mi rostro'), findsWidgets);
    expect(find.byKey(const Key('rostro.retirar')), findsOneWidget);
  });

  testWidgets('sin conexión: lo dice, descarta la foto y no registra nada', (t) async {
    final rostro = RostroFalso()..falloSiguiente = const Fallo(ClaseDeFallo.sinConexion, 'x');
    await montar(t, rostro);
    await tomarYAceptar(t);
    await t.tap(find.byKey(const Key('rostro.registrar')));
    await t.pumpAndSettle();
    expect(find.text(avisoSinConexionDelRostro), findsOneWidget);
    expect(rostro.registros, isEmpty);
    // La foto ya no está, ni la aceptación: hay que empezar de nuevo.
    expect(find.text('La foto sirve.'), findsNothing);
    expect(habilitado(t), isFalse);
  });

  testWidgets('la política cambió (409): se dice y se vuelve a leer', (t) async {
    final rostro = RostroFalso()
      ..falloSiguiente = const Fallo(ClaseDeFallo.servidor, 'La política del rostro cambió');
    await montar(t, rostro);
    expect(rostro.lecturas, 1);
    await tomarYAceptar(t);
    await t.tap(find.byKey(const Key('rostro.registrar')));
    await t.pumpAndSettle();
    expect(find.text('La política del rostro cambió'), findsOneWidget);
    expect(rostro.lecturas, 2);
  });

  testWidgets('con la política nueva, la casilla vuelve sin marcar: se acepta lo que se leyó', (
    t,
  ) async {
    final rostro = RostroFalso();
    await montar(t, rostro);
    await tomarYAceptar(t);
    rostro
      ..politicaVigente = const PoliticaDelRostro(version: 'rostro-de-prueba-2', texto: 'Nueva…')
      ..falloSiguiente = const Fallo(ClaseDeFallo.servidor, 'La política del rostro cambió');
    await t.tap(find.byKey(const Key('rostro.registrar')));
    await t.pumpAndSettle();
    expect(find.text('Nueva…'), findsOneWidget);
    expect(habilitado(t), isFalse, reason: 'la aceptación era del texto anterior');
    expect(rostro.registros, isEmpty);
    await t.tap(find.byKey(const Key('rostro.acepto')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('rostro.registrar')));
    await t.pumpAndSettle();
    expect(rostro.registros.single.$2, 'rostro-de-prueba-2');
  });

  testWidgets('retirar pide confirmación; cancelar no retira, confirmar sí', (t) async {
    final rostro = RostroFalso(inicial: RostroFalso.activo);
    await montar(t, rostro);
    await t.tap(find.byKey(const Key('rostro.retirar')));
    await t.pumpAndSettle();
    await t.tap(find.text('Cancelar'));
    await t.pumpAndSettle();
    expect(rostro.retiros, 0);
    await t.tap(find.byKey(const Key('rostro.retirar')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('rostro.confirmarRetiro')));
    await t.pumpAndSettle();
    expect(rostro.retiros, 1);
    expect(find.text('Su rostro se retiró.'), findsOneWidget);
    expect(find.byKey(const Key('rostro.retirar')), findsNothing);
  });
}
