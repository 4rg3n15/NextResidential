/// RONDA 15-W · revocar una visita propia desde la pestaña de visitantes: sólo
/// donde tiene sentido, con motivo obligatorio, y con lo que contestó el
/// servidor —de cuántos equipos salió la foto, o que ya estaba revocada—.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';

import '../dobles/app_de_prueba.dart';

Future<Mundo> abrirVisitantes(WidgetTester t) async {
  t.view.physicalSize = const Size(1000, 2400);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.reset);
  final mundo = Mundo();
  mundo.repo.autorizaciones = [
    visitaDelConjunto('aut-1', 'Ana Vigente', SituacionDeVisita.vigente),
    visitaDelConjunto('aut-2', 'Luis Programado', SituacionDeVisita.programada),
    visitaDelConjunto('aut-3', 'Eva Vencida', SituacionDeVisita.vencida),
    visitaDelConjunto(
      'aut-4',
      'Raúl Rechazado',
      SituacionDeVisita.rechazada,
      motivo: 'No lo esperan',
    ),
  ];
  final (app, _, _) = await mundo.arrancar();
  await t.pumpWidget(app);
  await t.pumpAndSettle();
  await t.tap(find.text('Visitantes'));
  await t.pumpAndSettle();
  return mundo;
}

bool confirmar(WidgetTester t) =>
    t.widget<FilledButton>(find.byKey(const Key('motivo.confirmar'))).onPressed != null;

void main() {
  testWidgets('«Revocar» sólo en lo vigente o programado; exige motivo; dice de cuántos equipos', (
    t,
  ) async {
    final mundo = await abrirVisitantes(t);
    expect(find.byKey(const Key('visita.revocar.aut-1')), findsOneWidget);
    expect(find.byKey(const Key('visita.revocar.aut-2')), findsOneWidget);
    expect(find.byKey(const Key('visita.revocar.aut-3')), findsNothing, reason: 'vencida');
    expect(find.byKey(const Key('visita.revocar.aut-4')), findsNothing, reason: 'ya rechazada');

    final lecturasAntes = mundo.repo.leidas('autorizaciones');
    await t.tap(find.byKey(const Key('visita.revocar.aut-1')));
    await t.pumpAndSettle();
    expect(find.text('¿Revocar la visita de Ana Vigente?'), findsOneWidget);
    expect(confirmar(t), isFalse, reason: 'sin motivo no se revoca');
    await t.enterText(find.byKey(const Key('motivo.texto')), '   ');
    await t.pump();
    expect(confirmar(t), isFalse, reason: 'sólo espacios tampoco');
    await t.enterText(find.byKey(const Key('motivo.texto')), 'Ya no viene hoy');
    await t.pump();
    await t.tap(find.byKey(const Key('motivo.confirmar')));
    await t.pumpAndSettle();

    expect(mundo.revocacion.revocadas.single, ('aut-1', 'Ya no viene hoy'));
    expect(find.text('Visita revocada. Su foto salió de 2 equipo(s).'), findsOneWidget);
    expect(mundo.repo.leidas('autorizaciones'), greaterThan(lecturasAntes), reason: 'se recarga');
  });

  testWidgets('cancelar no revoca nada', (t) async {
    final mundo = await abrirVisitantes(t);
    await t.tap(find.byKey(const Key('visita.revocar.aut-2')));
    await t.pumpAndSettle();
    await t.tap(find.text('Cancelar'));
    await t.pumpAndSettle();
    expect(mundo.revocacion.revocadas, isEmpty);
  });

  testWidgets('si el servidor contesta que ya estaba revocada, se dice su texto', (t) async {
    final mundo = await abrirVisitantes(t);
    mundo.revocacion.fallo = const Fallo(ClaseDeFallo.servidor, 'La visita ya está revocada');
    await t.tap(find.byKey(const Key('visita.revocar.aut-1')));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const Key('motivo.texto')), 'Duplicada');
    await t.pump();
    await t.tap(find.byKey(const Key('motivo.confirmar')));
    await t.pumpAndSettle();
    expect(find.text('La visita ya está revocada'), findsOneWidget);
  });
}
