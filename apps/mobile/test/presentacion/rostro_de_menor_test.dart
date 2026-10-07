/// 15-X (D3) · el rostro de un menor en la app: su ficha lo ofrece según su
/// edad y quién mira, y la pantalla del rostro —la misma que «Mi rostro»— no
/// registra sin las dos declaraciones del representante legal.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/hogar.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/rostro.dart';
import 'package:ncr_residente/presentacion/pantallas/mi_rostro.dart';
import 'package:ncr_residente/presentacion/textos_del_rostro.dart';

import '../dobles/hogar_15w_falso.dart';
import '../dobles/hogar_falso.dart';
import '../dobles/rostro_falso.dart';
import '../dobles/visitas.dart';
import 'menores_test.dart' show abrirFamilia;

const _noTitular = MisOcupantes(
  declarados: 2,
  declarada: true,
  aviso: avisoDePrueba,
  tope: 4,
  esTitular: false,
  plazas: [],
);

void main() {
  /// «Mi familia» → «Editar» del menor de `edad` años.
  Future<RostroDeMenoresFalso> fichaDelMenor(
    WidgetTester t, {
    int? edad = 16,
    bool titular = true,
  }) async {
    final rostros = RostroDeMenoresFalso();
    await abrirFamilia(
      t,
      menores: MenoresFalsos(lista: [menorDePrueba(edad: edad)]),
      alta: titular ? AltaFalsa() : AltaFalsa(ocupantes: _noTitular),
      rostros: rostros,
    );
    await t.tap(find.byKey(const Key('menor.editar.r-3')));
    await t.pumpAndSettle();
    return rostros;
  }

  bool habilitado(WidgetTester t) =>
      t.widget<FilledButton>(find.byKey(const Key('rostro.registrar'))).onPressed != null;

  testWidgets('el titular, con un menor de 16: lo registra con las dos declaraciones', (t) async {
    final rostros = await fichaDelMenor(t);
    expect(find.text('Registrar rostro'), findsOneWidget);
    await t.tap(find.byKey(const Key('menor.rostro.abrir')));
    await t.pumpAndSettle();
    expect(find.text('Rostro de Sofía Pérez'), findsOneWidget);
    await t.tap(find.byKey(const Key('foto.tomar')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('rostro.acepto')));
    await t.pumpAndSettle();
    expect(habilitado(t), isFalse, reason: 'faltan las dos declaraciones');
    await t.tap(find.byKey(const Key('rostro.declaracion.0')));
    await t.pumpAndSettle();
    expect(habilitado(t), isFalse, reason: 'falta que el menor esté informado y de acuerdo');
    await t.tap(find.byKey(const Key('rostro.declaracion.1')));
    await t.pumpAndSettle();
    expect(habilitado(t), isTrue);
    await t.tap(find.byKey(const Key('rostro.registrar')));
    await t.pumpAndSettle();
    final delMenor = rostros.porMenor['r-3'];
    expect(delMenor?.registros.single.$2, RostroFalso.politica.version);
    expect(rostros.porMenor.keys, ['r-3'], reason: 'el rostro de ESE menor, y de nadie más');
  });

  testWidgets('otro adulto del hogar: se le explica, y no hay botón', (t) async {
    await fichaDelMenor(t, titular: false);
    expect(find.text('Lo registra el titular del hogar.'), findsOneWidget);
    expect(find.byKey(const Key('menor.rostro.abrir')), findsNothing);
  });

  testWidgets('con 14 años: no se registra, para nadie', (t) async {
    await fichaDelMenor(t, edad: 14);
    expect(find.text('No se registra el rostro de menores de 15 años.'), findsOneWidget);
    expect(find.byKey(const Key('menor.rostro.abrir')), findsNothing);
  });

  testWidgets('con 18 cumplidos: la ficha no habla de su rostro', (t) async {
    await fichaDelMenor(t, edad: 18);
    expect(find.byKey(const Key('menor.rostro')), findsNothing);
  });

  /// La pantalla del rostro de Sofía, con la foto, la política y las dos
  /// declaraciones marcadas: lista para registrar.
  Future<RostroFalso> todoMarcado(WidgetTester t) async {
    final rostro = RostroFalso();
    t.view.physicalSize = const Size(1000, 2800);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        home: PantallaDeMiRostro(
          rostro: rostro,
          tomarFoto: (_) async => fotoTomada(medidasBuenas),
          textos: TextosDelRostro.deMenor('Sofía Pérez'),
        ),
      ),
    );
    await t.pumpAndSettle();
    for (final clave in ['foto.tomar', 'rostro.acepto', 'rostro.declaracion.0']) {
      await t.tap(find.byKey(Key(clave)));
      await t.pumpAndSettle();
    }
    await t.tap(find.byKey(const Key('rostro.declaracion.1')));
    await t.pumpAndSettle();
    expect(habilitado(t), isTrue);
    return rostro;
  }

  bool nadaMarcado(WidgetTester t) =>
      t.widgetList<CheckboxListTile>(find.byType(CheckboxListTile)).every((c) => c.value == false);

  testWidgets('sin foto nueva, las declaraciones se descartan con la foto (sin conexión)', (
    t,
  ) async {
    final rostro = await todoMarcado(t);
    rostro.falloSiguiente = const Fallo(ClaseDeFallo.sinConexion, 'x');
    await t.tap(find.byKey(const Key('rostro.registrar')));
    await t.pumpAndSettle();
    expect(nadaMarcado(t), isTrue, reason: 'hay que declarar de nuevo');
  });

  testWidgets('con la política nueva (409), la aceptación y las dos declaraciones, sin marcar', (
    t,
  ) async {
    final rostro = await todoMarcado(t);
    rostro
      ..politicaVigente = const PoliticaDelRostro(version: 'rostro-de-prueba-2', texto: 'Nueva…')
      ..falloSiguiente = const Fallo(ClaseDeFallo.servidor, 'La política del rostro cambió');
    await t.tap(find.byKey(const Key('rostro.registrar')));
    await t.pumpAndSettle();
    expect(find.text('Nueva…'), findsOneWidget);
    expect(nadaMarcado(t), isTrue, reason: 'se declara sobre el texto que se leyó');
    expect(rostro.registros, isEmpty);
  });

  testWidgets('«Mi rostro» sigue sin declaraciones: sólo la política', (t) async {
    await t.pumpWidget(
      MaterialApp(
        home: PantallaDeMiRostro(
          rostro: RostroFalso(),
          tomarFoto: (_) async => fotoTomada(medidasBuenas),
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.text('Mi rostro'), findsOneWidget);
    expect(find.byKey(const Key('rostro.declaracion.0')), findsNothing);
  });
}
