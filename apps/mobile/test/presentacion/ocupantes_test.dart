/// RONDA 15-W · «Ocupantes»: el titular comparte los códigos con prefijo,
/// añade plazas hasta el tope —«3 de 4»— y retira las libres con motivo. El
/// número ya no es DEFINITIVO.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/hogar.dart';
import 'package:ncr_residente/dominio/menores.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/presentacion/acciones_de_la_familia.dart';
import 'package:ncr_residente/presentacion/controlador.dart';

import '../dobles/hogar_15w_falso.dart';
import '../dobles/hogar_falso.dart';
import '../dobles/rostro_falso.dart';

class RelojFijo implements Reloj {
  @override
  DateTime ahora() => DateTime.utc(2026, 10, 6, 15);
}

/// «Ocupantes» abierta como la abre el perfil, sobre las plazas de `alta`.
Future<PlazasFalsas> abrirOcupantes(WidgetTester t, AltaFalsa alta) async {
  t.view.physicalSize = const Size(1000, 2400);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.reset);
  final plazas = PlazasFalsas(alta);
  final ocupantes = ControladorDeVista<MisOcupantes>(leer: alta.misOcupantes);
  await ocupantes.cargarAhora();
  await t.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (contexto) {
          final acciones = AccionesDeLaFamilia(
            menores: MenoresFalsos(),
            plazas: plazas,
            alta: alta,
            familia: ControladorDeVista<List<MiembroDeFamilia>>(leer: () async => const []),
            menoresDelHogar: ControladorDeVista<List<MenorDelHogar>>(leer: () async => const []),
            ocupantes: ocupantes,
            reloj: RelojFijo(),
            abrir: (pantalla, _) =>
                Navigator.of(contexto).push(MaterialPageRoute<void>(builder: (_) => pantalla)),
            rostroDeMenores: RostroDeMenoresFalso(),
            tomarFoto: (_) async => null,
          );
          return Scaffold(
            body: TextButton(
              onPressed: () => acciones.abrirOcupantes(contexto, alPedirAcceso: () {}),
              child: const Text('abrir'),
            ),
          );
        },
      ),
    ),
  );
  await t.tap(find.text('abrir'));
  await t.pumpAndSettle();
  return plazas;
}

bool activo(WidgetTester t, String clave) {
  final boton = t.widget<ButtonStyleButton>(find.byKey(Key(clave)));
  return boton.onPressed != null;
}

void main() {
  testWidgets('el titular añade plazas hasta el tope, «3 de 4», y en el tope sabe a quién pedir', (
    t,
  ) async {
    final plazas = await abrirOcupantes(t, AltaFalsa());
    expect(find.text('Plazas: 2 de 4'), findsOneWidget);
    expect(find.textContaining('DEFINITIVO'), findsNothing);
    expect(find.text(avisoDelTope), findsNothing);

    await t.tap(find.byKey(const Key('ocupantes.anadir')));
    await t.pumpAndSettle();
    expect(find.text('Plazas: 3 de 4'), findsOneWidget);
    expect(find.text('MIRA-NUEV-A003'), findsOneWidget, reason: 'la nueva, con su código');

    await t.tap(find.byKey(const Key('ocupantes.anadir')));
    await t.pumpAndSettle();
    expect(find.text('Plazas: 4 de 4'), findsOneWidget);
    expect(plazas.anadidas, 2);
    expect(activo(t, 'ocupantes.anadir'), isFalse);
    expect(find.text(avisoDelTope), findsOneWidget);
  });

  testWidgets('«Retirar» sólo en las libres, con un motivo de al menos tres letras', (t) async {
    final plazas = await abrirOcupantes(t, AltaFalsa());
    expect(find.byKey(const Key('ocupantes.retirar.1')), findsNothing, reason: 'la del titular');
    await t.tap(find.byKey(const Key('ocupantes.retirar.2')));
    await t.pumpAndSettle();
    expect(activo(t, 'motivo.confirmar'), isFalse);
    await t.enterText(find.byKey(const Key('motivo.texto')), 'no');
    await t.pump();
    expect(activo(t, 'motivo.confirmar'), isFalse, reason: 'dos letras no bastan');
    await t.enterText(find.byKey(const Key('motivo.texto')), 'Ya no vive aquí');
    await t.pump();
    await t.tap(find.byKey(const Key('motivo.confirmar')));
    await t.pumpAndSettle();
    expect(plazas.retiros.single, ('p2', 'Ya no vive aquí'));
    expect(find.text('Plazas: 1 de 4'), findsOneWidget);
    expect(find.text('MIRA-ABCD-EFGH'), findsNothing);
  });

  testWidgets('«Compartir» copia el mensaje con el código y dice que lo copió', (t) async {
    final copiado = <String>[];
    t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (
      llamada,
    ) async {
      if (llamada.method == 'Clipboard.setData') {
        copiado.add((llamada.arguments as Map)['text'] as String);
      }
      return null;
    });
    addTearDown(
      () =>
          t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null),
    );
    await abrirOcupantes(t, AltaFalsa());
    expect(find.text('MIRA-ABCD-EFGH'), findsOneWidget, reason: 'el código, con su prefijo');
    await t.tap(find.text('Compartir'));
    await t.pumpAndSettle();
    expect(copiado, ['Descargue la app, pulse Crear cuenta y use este código: MIRA-ABCD-EFGH']);
    expect(find.textContaining('Mensaje con el código copiado'), findsOneWidget);
  });

  testWidgets('el rechazo del servidor al añadir se dice con su texto', (t) async {
    final alta = AltaFalsa(
      ocupantes: const MisOcupantes(
        declarados: 4,
        declarada: true,
        aviso: avisoDePrueba,
        // El tope que vio la pantalla todavía dejaba añadir; la base no.
        tope: 5,
        esTitular: true,
        plazas: [
          PlazaDeOcupante(id: 'p1', numero: 1, libre: false, codigo: null, ocupante: 'Ana'),
          PlazaDeOcupante(id: 'p2', numero: 2, libre: false, codigo: null, ocupante: 'Luis'),
          PlazaDeOcupante(id: 'p3', numero: 3, libre: false, codigo: null, ocupante: 'Sofía'),
          PlazaDeOcupante(id: 'p4', numero: 4, libre: false, codigo: null, ocupante: 'Eva'),
        ],
      ),
    );
    await abrirOcupantes(t, alta);
    alta.ocupantes = MisOcupantes(
      declarados: 4,
      declarada: true,
      aviso: avisoDePrueba,
      tope: 4,
      esTitular: true,
      plazas: alta.ocupantes.plazas,
    );
    await t.tap(find.byKey(const Key('ocupantes.anadir')));
    await t.pumpAndSettle();
    expect(find.textContaining('el máximo de 4 plazas'), findsOneWidget);
  });

  testWidgets('quien no es titular ve las plazas y comparte, pero no añade ni retira', (t) async {
    final alta = AltaFalsa(
      ocupantes: const MisOcupantes(
        declarados: 2,
        declarada: true,
        aviso: avisoDePrueba,
        tope: 4,
        esTitular: false,
        plazas: [
          PlazaDeOcupante(id: 'p1', numero: 1, libre: false, codigo: null, ocupante: 'Ana Pérez'),
          PlazaDeOcupante(
            id: 'p2',
            numero: 2,
            libre: true,
            codigo: 'MIRA-ABCD-EFGH',
            ocupante: null,
          ),
        ],
      ),
    );
    await abrirOcupantes(t, alta);
    expect(find.text('Compartir'), findsOneWidget);
    expect(find.byKey(const Key('ocupantes.anadir')), findsNothing);
    expect(find.byKey(const Key('ocupantes.retirar.2')), findsNothing);
    expect(find.text('Sólo el titular de la vivienda añade y retira plazas.'), findsOneWidget);
  });
}
