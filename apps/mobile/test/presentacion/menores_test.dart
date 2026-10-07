/// RONDA 15-W · los menores del hogar en «Mi familia»: cualquier adulto los
/// añade en una plaza libre, los edita y los da de baja con motivo; el
/// servidor decide la edad y su texto se ve tal cual.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/edad.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/hogar.dart';
import 'package:ncr_residente/dominio/menores.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/presentacion/acciones_de_la_familia.dart';
import 'package:ncr_residente/presentacion/controlador.dart';

import '../dobles/hogar_15w_falso.dart';
import '../dobles/hogar_falso.dart';
import '../dobles/rostro_falso.dart';
import '../dobles/visitas.dart';

class RelojFijo implements Reloj {
  @override
  DateTime ahora() => DateTime.utc(2026, 10, 6, 15);
}

const sofiaEnLaFamilia = MiembroDeFamilia(
  residenteId: 'r-3',
  nombre: 'Sofía Pérez',
  parentesco: 'Hija',
  esTitular: false,
  nivelAcceso: null,
  activo: true,
);

/// «Mi familia» abierta desde un armazón mínimo, con las acciones de verdad
/// sobre puertos falsos.
Future<void> abrirFamilia(
  WidgetTester t, {
  required MenoresFalsos menores,
  required AltaFalsa alta,
  RostroDeMenoresFalso? rostros,
}) async {
  t.view.physicalSize = const Size(1000, 2400);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.reset);
  final familia = ControladorDeVista<List<MiembroDeFamilia>>(
    leer: () async => const [anaTitular, sofiaEnLaFamilia],
  );
  final menoresDelHogar = ControladorDeVista<List<MenorDelHogar>>(leer: menores.misMenores);
  final ocupantes = ControladorDeVista<MisOcupantes>(leer: alta.misOcupantes);
  await Future.wait([
    familia.cargarAhora(),
    menoresDelHogar.cargarAhora(),
    ocupantes.cargarAhora(),
  ]);
  await t.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (contexto) {
          final acciones = AccionesDeLaFamilia(
            menores: menores,
            plazas: PlazasFalsas(alta),
            alta: alta,
            familia: familia,
            menoresDelHogar: menoresDelHogar,
            ocupantes: ocupantes,
            reloj: RelojFijo(),
            abrir: (pantalla, _) =>
                Navigator.of(contexto).push(MaterialPageRoute<void>(builder: (_) => pantalla)),
            rostroDeMenores: rostros ?? RostroDeMenoresFalso(),
            tomarFoto: (_) async => fotoTomada(medidasBuenas),
          );
          return Scaffold(
            body: TextButton(
              onPressed: () => acciones.abrirFamilia(contexto, alPedirAcceso: () {}),
              child: const Text('abrir'),
            ),
          );
        },
      ),
    ),
  );
  await t.tap(find.text('abrir'));
  await t.pumpAndSettle();
}

Future<void> llenarMenor(WidgetTester t, {String fecha = '2015-08-21'}) async {
  await t.enterText(find.byKey(const Key('menor.nombres')), 'Tomás');
  await t.enterText(find.byKey(const Key('menor.apellidos')), 'Pérez');
  await t.enterText(find.byKey(const Key('menor.fechaNacimiento')), fecha);
  await t.enterText(find.byKey(const Key('menor.parentesco')), 'Hijo');
  await t.enterText(find.byKey(const Key('menor.numeroDocumento')), '1020304050');
}

void main() {
  testWidgets('Mi familia: cada menor UNA vez, con su edad, su documento enmascarado y acciones', (
    t,
  ) async {
    await abrirFamilia(t, menores: MenoresFalsos(), alta: AltaFalsa());
    expect(find.text('Sofía Pérez'), findsOneWidget, reason: 'familia y menores se cruzan');
    expect(find.text('Hija · 11 años · Tarjeta de identidad ••••5678 · plaza 3'), findsOneWidget);
    expect(find.byKey(const Key('menor.editar.r-3')), findsOneWidget);
    expect(find.byKey(const Key('menor.baja.r-3')), findsOneWidget);
    // Aún no cumplió 18: ningún código de traspaso.
    expect(find.byKey(const Key('menor.traspaso.r-3')), findsNothing);
    expect(find.text('Ana Pérez'), findsOneWidget);
  });

  testWidgets('un adulto añade un menor en una plaza LIBRE de su vivienda', (t) async {
    final menores = MenoresFalsos();
    await abrirFamilia(t, menores: menores, alta: AltaFalsa());
    await t.tap(find.byKey(const Key('familia.anadirMenor')));
    await t.pumpAndSettle();
    expect(find.text('Añadir menor'), findsWidgets);
    expect(find.text('Plaza 2'), findsOneWidget, reason: 'la única libre, ya elegida');
    await llenarMenor(t);
    await t.tap(find.byKey(const Key('menor.guardar')));
    await t.pumpAndSettle();
    final m = menores.registros.single;
    expect(
      (m.plazaId, m.tipoDocumento, m.numeroDocumento),
      ('p2', 'tarjeta_identidad', '1020304050'),
    );
    expect(
      (m.datos.nombres, m.datos.fechaNacimiento, m.datos.parentesco),
      ('Tomás', '2015-08-21', 'Hijo'),
    );
    expect(find.text('Menor registrado en su plaza.'), findsOneWidget);
  });

  testWidgets('una persona de 18 o más no es un menor: se ve el texto del SERVIDOR', (t) async {
    final menores = MenoresFalsos()
      ..falloAlEscribir = const Fallo(ClaseDeFallo.datosNoValidos, mensajeMayorSinCuenta);
    await abrirFamilia(t, menores: menores, alta: AltaFalsa());
    await t.tap(find.byKey(const Key('familia.anadirMenor')));
    await t.pumpAndSettle();
    // El teléfono cree que es un menor; el servidor, con su reloj, decide.
    await llenarMenor(t, fecha: '2008-10-06');
    await t.tap(find.byKey(const Key('menor.guardar')));
    await t.pumpAndSettle();
    expect(find.text(mensajeMayorSinCuenta), findsOneWidget);
    expect(
      find.byKey(const Key('menor.guardar')),
      findsOneWidget,
      reason: 'sigue en el formulario',
    );
  });

  testWidgets('cortesía: la fecha de un adulto se avisa antes de enviar', (t) async {
    final menores = MenoresFalsos();
    await abrirFamilia(t, menores: menores, alta: AltaFalsa());
    await t.tap(find.byKey(const Key('familia.anadirMenor')));
    await t.pumpAndSettle();
    await llenarMenor(t, fecha: '1990-05-17');
    await t.tap(find.byKey(const Key('menor.guardar')));
    await t.pumpAndSettle();
    expect(find.text(mensajeMayorSinCuenta), findsOneWidget);
    expect(menores.registros, isEmpty);
  });

  testWidgets('sin plazas libres no hay formulario: se dice a quién pedirla', (t) async {
    final alta = AltaFalsa(
      ocupantes: const MisOcupantes(
        declarados: 1,
        declarada: true,
        aviso: avisoDePrueba,
        tope: 4,
        esTitular: false,
        plazas: [
          PlazaDeOcupante(id: 'p1', numero: 1, libre: false, codigo: null, ocupante: 'Ana Pérez'),
        ],
      ),
    );
    await abrirFamilia(t, menores: MenoresFalsos(), alta: alta);
    await t.tap(find.byKey(const Key('familia.anadirMenor')));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('menor.guardar')), findsNothing);
    expect(
      find.text('No hay plazas libres. Pídale al titular que añada una en Ocupantes.'),
      findsOneWidget,
    );
  });

  testWidgets('editar: nombre, parentesco y fecha; el documento y la plaza no se tocan', (t) async {
    final menores = MenoresFalsos();
    await abrirFamilia(t, menores: menores, alta: AltaFalsa());
    await t.tap(find.byKey(const Key('menor.editar.r-3')));
    await t.pumpAndSettle();
    expect(find.text('Editar menor'), findsOneWidget);
    expect(find.byKey(const Key('menor.numeroDocumento')), findsNothing);
    expect(find.byKey(const Key('menor.plaza')), findsNothing);
    await t.enterText(find.byKey(const Key('menor.parentesco')), 'Hija mayor');
    await t.tap(find.byKey(const Key('menor.guardar')));
    await t.pumpAndSettle();
    final (id, datos) = menores.ediciones.single;
    expect((id, datos.parentesco, datos.nombres), ('r-3', 'Hija mayor', 'Sofía'));
  });

  testWidgets('dar de baja exige un motivo de al menos 5 letras', (t) async {
    final menores = MenoresFalsos();
    await abrirFamilia(t, menores: menores, alta: AltaFalsa());
    await t.tap(find.byKey(const Key('menor.baja.r-3')));
    await t.pumpAndSettle();
    bool confirmar() =>
        t.widget<FilledButton>(find.byKey(const Key('motivo.confirmar'))).onPressed != null;
    expect(confirmar(), isFalse);
    await t.enterText(find.byKey(const Key('motivo.texto')), 'Mudó');
    await t.pump();
    expect(confirmar(), isFalse, reason: 'cuatro letras no bastan');
    await t.enterText(find.byKey(const Key('motivo.texto')), 'Se mudó con su madre');
    await t.pump();
    await t.tap(find.byKey(const Key('motivo.confirmar')));
    await t.pumpAndSettle();
    expect(menores.bajas.single, ('r-3', 'Se mudó con su madre'));
    expect(find.textContaining('Su plaza quedó libre'), findsOneWidget);
  });

  testWidgets('quien ya cumplió 18: el titular le genera su código para crear la cuenta', (
    t,
  ) async {
    final menores = MenoresFalsos(lista: [menorDePrueba(edad: 18)]);
    await abrirFamilia(t, menores: menores, alta: AltaFalsa());
    expect(find.textContaining('Ya cumplió 18 años'), findsOneWidget);
    await t.tap(find.byKey(const Key('menor.traspaso.r-3')));
    await t.pumpAndSettle();
    expect(menores.traspasos.single, 'r-3');
    expect(find.text('MIRA-TRAS-PASO'), findsOneWidget);
  });

  testWidgets('quien no es titular no ve el código de traspaso', (t) async {
    final alta = AltaFalsa(
      ocupantes: const MisOcupantes(
        declarados: 2,
        declarada: true,
        aviso: avisoDePrueba,
        tope: 4,
        esTitular: false,
        plazas: [],
      ),
    );
    await abrirFamilia(
      t,
      menores: MenoresFalsos(lista: [menorDePrueba(edad: 18)]),
      alta: alta,
    );
    expect(find.byKey(const Key('menor.traspaso.r-3')), findsNothing);
    expect(find.byKey(const Key('menor.editar.r-3')), findsOneWidget, reason: 'editar sí');
  });
}
