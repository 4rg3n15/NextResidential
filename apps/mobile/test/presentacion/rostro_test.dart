/// CU-02 desde el teléfono. Lo que se prueba no es que la foto se envíe: es
/// que la pantalla NUNCA deje creer que el trámite acabó cuando no acabó.
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/calidad_de_captura.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/infraestructura/camara/fuente_de_fotos.dart';
import 'package:ncr_residente/presentacion/pantallas/rostro_del_visitante.dart';

FotoTomada foto(MedidasDeCaptura m) =>
    FotoTomada(vector: Uint8List.fromList(List<int>.filled(64, 3)), medidas: m);

const buena = MedidasDeCaptura(
  nitidez: 0.8,
  iluminacion: 0.5,
  rostrosDetectados: 1,
  proporcionRostro: 0.4,
);
const mala = MedidasDeCaptura(
  nitidez: 0.05,
  iluminacion: 0.02,
  rostrosDetectados: 2,
  proporcionRostro: 0.02,
);

void main() {
  Future<List<FotoTomada>> montar(
    WidgetTester t, {
    required MedidasDeCaptura medidas,
    required Future<ResultadoDeCaptura> Function(FotoTomada) enviar,
  }) async {
    t.view.physicalSize = const Size(1000, 2400);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    final enviadas = <FotoTomada>[];
    await t.pumpWidget(
      MaterialApp(
        home: PantallaDeRostroDelVisitante(
          nombreDelVisitante: 'Plomero Pérez',
          versionPolitica: 'v1.0',
          tomarFoto: () async => foto(medidas),
          enviar: (f) {
            enviadas.add(f);
            return enviar(f);
          },
        ),
      ),
    );
    await t.pumpAndSettle();
    return enviadas;
  }

  testWidgets('RN-10 · lo PRIMERO que se lee es de quién es el permiso', (t) async {
    // Va arriba, antes de la foto: leerlo después de haber fotografiado a
    // alguien no sirve de nada.
    await montar(t, medidas: buena, enviar: (_) async => throw UnimplementedError());
    expect(find.textContaining('no suyo'), findsOneWidget);
    expect(find.textContaining('solo él puede darlo'), findsOneWidget);
  });

  testWidgets('RN-10 · NO hay ninguna casilla de aceptar en la pantalla del residente', (t) async {
    // Una casilla aquí sería la firma de otro en un papel.
    await montar(t, medidas: buena, enviar: (_) async => throw UnimplementedError());
    expect(find.byType(Checkbox), findsNothing);
    expect(find.byType(Switch), findsNothing);
    expect(find.byType(CheckboxListTile), findsNothing);
  });

  testWidgets('CA-08 · una foto mala da TODOS los consejos, no el primero', (t) async {
    await montar(t, medidas: mala, enviar: (_) async => throw UnimplementedError());
    await t.tap(find.text('Tomar la foto'));
    await t.pumpAndSettle();

    // Movida, oscura, dos personas y demasiado lejos: cuatro problemas, cuatro
    // consejos. De uno en uno serían cuatro viajes.
    expect(find.textContaining('quieto'), findsOneWidget);
    expect(find.textContaining('poca luz'), findsOneWidget);
    expect(find.textContaining('más de una persona'), findsOneWidget);
    expect(find.textContaining('Acérquese'), findsOneWidget);
  });

  testWidgets('una foto mala NO se puede enviar', (t) async {
    final enviadas = await montar(
      t,
      medidas: mala,
      enviar: (_) async => const CapturaAceptada(
        consentimientoId: 'c1',
        titular: 'Plomero Pérez',
        calidad: 0.9,
      ),
    );
    await t.tap(find.text('Tomar la foto'));
    await t.pumpAndSettle();
    await t.tap(find.text('Pedirle el permiso'));
    await t.pumpAndSettle();

    expect(enviadas, isEmpty, reason: 'el botón está deshabilitado y además hay guarda');
  });

  testWidgets('EL DESENLACE BUENO NO DICE «LISTO»: dice a quién le toca', (t) async {
    // Decir «listo» haría que el residente mandara a su visitante a una
    // terminal que todavía no lo conoce.
    await montar(
      t,
      medidas: buena,
      enviar: (_) async => const CapturaAceptada(
        consentimientoId: 'c1',
        titular: 'Plomero Pérez',
        calidad: 0.9,
      ),
    );
    await t.tap(find.text('Tomar la foto'));
    await t.pumpAndSettle();
    await t.tap(find.text('Pedirle el permiso'));
    await t.pumpAndSettle();

    expect(find.text('Pendiente de que Plomero Pérez acepte'), findsOneWidget);
    // RN-09 dicho con todas las letras.
    expect(find.textContaining('NO se envía a ninguna terminal'), findsOneWidget);
    expect(find.textContaining('Usted no puede aceptar por él'), findsOneWidget);
  });

  testWidgets('KPI-16 · si el servidor rechaza la calidad, se dice y no se promete nada', (t) async {
    await montar(
      t,
      medidas: buena,
      enviar: (_) async => const CapturaRechazada(['NITIDEZ', 'ROSTROS_MULTIPLES']),
    );
    await t.tap(find.text('Tomar la foto'));
    await t.pumpAndSettle();
    await t.tap(find.text('Pedirle el permiso'));
    await t.pumpAndSettle();

    expect(find.text('El conjunto no aceptó la foto'), findsOneWidget);
    expect(find.textContaining('Pendiente de que'), findsNothing);
  });

  testWidgets('un fallo de red se explica y no se confunde con un rechazo', (t) async {
    await montar(
      t,
      medidas: buena,
      enviar: (_) async => throw const Fallo(ClaseDeFallo.sinConexion, 'No hay conexión.'),
    );
    await t.tap(find.text('Tomar la foto'));
    await t.pumpAndSettle();
    await t.tap(find.text('Pedirle el permiso'));
    await t.pumpAndSettle();

    expect(find.text('No se pudo enviar'), findsOneWidget);
    expect(find.textContaining('Pendiente de que'), findsNothing);
  });

  test('LA CÁMARA SIMULADA NO MIENTE: no siempre devuelve una foto buena', () async {
    // Una fuente que devolviera siempre una foto perfecta convertiría la
    // validación de calidad en adorno, y nadie vería jamás un consejo.
    final camara = CamaraSimulada(semilla: 7);
    var malas = 0;
    for (var i = 0; i < 40; i++) {
      final f = await camara.tomar();
      if (evaluarCaptura(f!.medidas).isNotEmpty) malas += 1;
    }
    expect(malas, greaterThan(0));
    expect(malas, lessThan(40), reason: 'y tampoco siempre mala: el flujo bueno se ejerce');
  });

  test('la simulada «siempre buena» sí pasa, para el recorrido de demostración', () async {
    final f = await CamaraSimulada(siempreBuena: true).tomar();
    expect(evaluarCaptura(f!.medidas), isEmpty);
  });
}
