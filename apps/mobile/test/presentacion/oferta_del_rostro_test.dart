/// 15-X (D2) · el primer ingreso ofrece «Registrar mi rostro» mientras la
/// cuenta no lo tenga y no haya dicho «Ahora no» —recordado por cuenta en el
/// almacén del teléfono—, y nunca bloquea: sin red, a la app.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/infraestructura/almacen/almacen_de_texto.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';
import 'package:ncr_residente/presentacion/pantallas/primer_ingreso.dart';

import '../dobles/app_de_prueba.dart';
import '../dobles/hogar_falso.dart';
import '../dobles/rostro_falso.dart';
import '../dobles/visitas.dart';
import 'alta_15w_test.dart' show AutenticadorSimple, RelojReal;

/// Sin `pumpAndSettle`: con la puerta terminada, el armazón la quitaría; aquí
/// queda su indicador de espera, que no se asienta nunca.
Future<void> asentar(WidgetTester t) async {
  for (var i = 0; i < 10; i += 1) {
    await t.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  /// La puerta con una cuenta que ya está dada de alta (o, con `alta`, que la
  /// completa ahora), sobre el almacén `recuerdos`.
  Future<int Function()> puerta(
    WidgetTester t,
    RostroFalso rostro,
    AlmacenDeTextoEnMemoria recuerdos, {
    AltaFalsa? alta,
  }) async {
    t.view.physicalSize = const Size(1000, 2800);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    final sesion = SesionEnUso(
      almacen: AlmacenEnMemoria(),
      autenticador: AutenticadorSimple(),
      reloj: RelojReal(),
    );
    await sesion.iniciar(
      identificador: const PorUsuario(codigo: 'MIRA', usuario: 'a'),
      clave: 'x',
    );
    var terminado = 0;
    await t.pumpWidget(
      MaterialApp(
        // Una puerta NUEVA cada vez, como al volver a abrir la app.
        home: PuertaDePrimerIngreso(
          key: UniqueKey(),
          sesion: sesion,
          alta: alta ?? AltaFalsa(estados: [estadoDeAlta()]),
          cuenta: CuentaFalsa(),
          oferta: OfertaDelRostro(rostro: rostro, almacen: recuerdos),
          tomarFoto: (_) async => fotoTomada(medidasBuenas),
          alTerminar: () => terminado += 1,
          alSalir: () {},
        ),
      ),
    );
    await asentar(t);
    return () => terminado;
  }

  Future<void> completarAlta(WidgetTester t) async {
    await t.enterText(find.byKey(const Key('perfil.nombres')), 'Ana');
    await t.enterText(find.byKey(const Key('perfil.apellidos')), 'Pérez');
    await t.enterText(find.byKey(const Key('perfil.fechaNacimiento')), '1990-05-17');
    await t.enterText(find.byKey(const Key('perfil.numeroDocumento')), '1000000001');
    await t.enterText(find.byKey(const Key('perfil.telefono')), '+573000000001');
    await t.tap(find.byKey(const Key('alta.enviar')));
    await t.pumpAndSettle();
  }

  final ahoraNo = find.byKey(const Key('rostro.ofrecer.ahoraNo'));

  testWidgets('recién dado de alta: la invitación va antes de la app', (t) async {
    final rostro = RostroFalso();
    final terminado = await puerta(
      t,
      rostro,
      AlmacenDeTextoEnMemoria(),
      alta: AltaFalsa(estados: [estadoDeAlta(vinculada: false), estadoDeAlta()]),
    );
    await completarAlta(t);
    await asentar(t);
    expect(ahoraNo, findsOneWidget);
    expect(terminado(), 0);
  });

  testWidgets('una cuenta ya dada de alta, sin rostro, también la recibe al entrar', (t) async {
    final terminado = await puerta(t, RostroFalso(), AlmacenDeTextoEnMemoria());
    expect(ahoraNo, findsOneWidget);
    expect(terminado(), 0);
  });

  testWidgets('«Ahora no»: a la app, y no se le vuelve a ofrecer a ESA cuenta', (t) async {
    final recuerdos = AlmacenDeTextoEnMemoria();
    final rostro = RostroFalso();
    final terminado = await puerta(t, rostro, recuerdos);
    await t.tap(ahoraNo);
    await asentar(t);
    expect(terminado(), 1);
    expect(recuerdos.datos.keys.single, contains('ncr.rostro.ahora-no.'));
    expect(rostro.registros, isEmpty);
    // Otra vez la misma cuenta en el mismo teléfono: directo a la app.
    final otraVez = await puerta(t, rostro, recuerdos);
    expect(ahoraNo, findsNothing);
    expect(otraVez(), 1);
  });

  testWidgets('con rostro registrado no se ofrece', (t) async {
    final terminado = await puerta(
      t,
      RostroFalso(inicial: RostroFalso.activo),
      AlmacenDeTextoEnMemoria(),
    );
    expect(ahoraNo, findsNothing);
    expect(terminado(), 1);
  });

  testWidgets('sin red para leer su rostro: no se ofrece y se entra (nunca bloquea)', (t) async {
    final rostro = RostroFalso()..falloAlLeer = const Fallo(ClaseDeFallo.sinConexion, 'x');
    final terminado = await puerta(t, rostro, AlmacenDeTextoEnMemoria());
    expect(ahoraNo, findsNothing);
    expect(terminado(), 1);
  });

  testWidgets('«Registrar mi rostro» abre la pantalla; al volver, a la app', (t) async {
    final rostro = RostroFalso();
    final terminado = await puerta(t, rostro, AlmacenDeTextoEnMemoria());
    await t.tap(find.byKey(const Key('rostro.ofrecer.registrar')));
    await t.pumpAndSettle();
    expect(find.text('Mi rostro'), findsOneWidget);
    await t.pageBack();
    await t.pump();
    await t.pump(const Duration(seconds: 1));
    expect(terminado(), 1);
  });

  testWidgets(
    'en la app: sin rostro se ofrece al entrar; tras «Ahora no», al volver a abrir ya no',
    (t) async {
      t.view.physicalSize = const Size(1000, 2800);
      t.view.devicePixelRatio = 1.0;
      addTearDown(t.view.reset);
      final mundo = Mundo();
      mundo.rostro.estado = RostroFalso.sinRostro;
      final (app, _, _) = await mundo.arrancar();
      await t.pumpWidget(app);
      await t.pumpAndSettle();
      expect(ahoraNo, findsOneWidget, reason: 'la cuenta ya estaba dada de alta y no tiene rostro');
      await t.tap(ahoraNo);
      await t.pumpAndSettle();
      expect(ahoraNo, findsNothing);
      expect(
        mundo.llavero.datos.keys.where((k) => k.startsWith('ncr.rostro.ahora-no.')),
        hasLength(1),
      );
      // Cerrar y volver a abrir con el MISMO teléfono: directo a la app.
      final (otraVez, _, _) = await mundo.arrancar();
      await t.pumpWidget(otraVez);
      await t.pumpAndSettle();
      expect(ahoraNo, findsNothing);
    },
  );
}
