/// RONDA 15-W · el primer ingreso sin vivienda ni código, y lo que pasa cuando
/// la cuenta no tiene vivienda, cuando la fecha es de un menor y cuando se
/// llega desde «Crear cuenta» con el correo ya escrito.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/edad.dart';
import 'package:ncr_residente/dominio/hogar.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';
import 'package:ncr_residente/presentacion/pantallas/alta.dart';
import 'package:ncr_residente/presentacion/pantallas/cambio_de_vivienda.dart';
import 'package:ncr_residente/presentacion/pantallas/primer_ingreso.dart';

import '../dobles/app_de_prueba.dart';
import '../dobles/hogar_falso.dart';

final hoy = DateTime.utc(2026, 10, 6, 15);

class AutenticadorSimple implements Autenticador {
  @override
  Future<Sesion> iniciarSesion(IdentificadorDeAcceso i, {required String clave}) async => Sesion(
    tokenDeAcceso: 'a',
    tokenDeRefresco: 'r',
    expiraEn: DateTime.now().toUtc().add(const Duration(minutes: 5)),
    usuarioId: 'u',
    copropiedadId: 'c',
    correo: '',
  );
  @override
  Future<Sesion> renovar(Sesion sesion) async => sesion;
}

class RelojReal implements Reloj {
  @override
  DateTime ahora() => DateTime.now().toUtc();
}

void main() {
  void lienzoGrande(WidgetTester t) {
    t.view.physicalSize = const Size(1000, 2600);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
  }

  Future<void> montarAlta(
    WidgetTester t,
    AltaFalsa alta, {
    String? correo,
    VoidCallback? alSalir,
  }) async {
    lienzoGrande(t);
    await t.pumpWidget(
      MaterialApp(
        home: PantallaDeAlta(
          estado: estadoDeAlta(vinculada: false),
          repositorio: alta,
          hoy: hoy,
          correoDeContacto: correo,
          alCompletar: () {},
          alSalir: alSalir ?? () {},
        ),
      ),
    );
    await t.pumpAndSettle();
  }

  Future<void> llenar(WidgetTester t, {String fecha = '1990-05-17'}) async {
    await t.enterText(find.byKey(const Key('perfil.nombres')), 'Ana');
    await t.enterText(find.byKey(const Key('perfil.apellidos')), 'Pérez');
    await t.enterText(find.byKey(const Key('perfil.fechaNacimiento')), fecha);
    await t.enterText(find.byKey(const Key('perfil.numeroDocumento')), '1000000001');
    await t.enterText(find.byKey(const Key('perfil.telefono')), '+573000000001');
  }

  Future<void> enviar(WidgetTester t) async {
    await t.tap(find.byKey(const Key('alta.enviar')));
    await t.pumpAndSettle();
  }

  testWidgets(
    'sin vivienda asignada: el aviso del servidor, ningún formulario y volver a consultar',
    (t) async {
      lienzoGrande(t);
      final sesion = SesionEnUso(
        almacen: AlmacenEnMemoria(),
        autenticador: AutenticadorSimple(),
        reloj: RelojReal(),
      );
      await sesion.iniciar(
        identificador: const PorUsuario(codigo: 'MIRA', usuario: 'a'),
        clave: 'x',
      );
      final alta = AltaFalsa(
        estados: [
          estadoDeAlta(
            vinculada: false,
            asignada: false,
            aviso: 'La administración debe asignarle su vivienda',
          ),
          estadoDeAlta(vinculada: false),
        ],
      );
      await t.pumpWidget(
        MaterialApp(
          home: PuertaDePrimerIngreso(
            sesion: sesion,
            alta: alta,
            cuenta: CuentaFalsa(),
            alTerminar: () {},
            alSalir: () {},
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('La administración debe asignarle su vivienda'), findsOneWidget);
      expect(find.text('Complete sus datos'), findsNothing);

      // La administración la asignó: al volver a consultar, el formulario.
      await t.tap(find.text('Volver a consultar'));
      await t.pumpAndSettle();
      expect(alta.consultas, 2);
      expect(find.text('Complete sus datos'), findsOneWidget);
    },
  );

  testWidgets('SIN_VIVIENDA al enviar: se pinta el texto del servidor', (t) async {
    final alta = AltaFalsa(
      respuestaAlta: const AltaRechazada(
        motivo: 'SIN_VIVIENDA',
        explicacion: 'La administración debe asignarle su vivienda',
      ),
    );
    await montarAlta(t, alta);
    await llenar(t);
    await enviar(t);
    expect(alta.primerosIngresos, hasLength(1));
    expect(find.text('La administración debe asignarle su vivienda'), findsOneWidget);
    expect(find.byKey(const Key('alta.enviar')), findsOneWidget, reason: 'el formulario sigue');
  });

  testWidgets('CUENTA_BLOQUEADA_POR_EDAD: lo dice con el texto del servidor y sólo ofrece salir', (
    t,
  ) async {
    var salidas = 0;
    final alta = AltaFalsa(
      respuestaAlta: const AltaRechazada(
        motivo: 'CUENTA_BLOQUEADA_POR_EDAD',
        explicacion: mensajeCuentaDeMenor,
      ),
    );
    await montarAlta(t, alta, alSalir: () => salidas += 1);
    await llenar(t);
    await enviar(t);
    expect(find.byKey(const Key('alta.bloqueada')), findsOneWidget);
    expect(find.text(mensajeCuentaDeMenor), findsOneWidget);
    expect(
      find.byKey(const Key('alta.enviar')),
      findsNothing,
      reason: 'no hay nada que reintentar',
    );
    await t.tap(find.text('Salir'));
    expect(salidas, 1);
  });

  testWidgets('cortesía: una fecha de menor se avisa ANTES de enviar (el servidor bloquearía)', (
    t,
  ) async {
    final alta = AltaFalsa();
    await montarAlta(t, alta);
    await llenar(t, fecha: '2012-03-04');
    await enviar(t);
    expect(find.text(mensajeCuentaDeMenor), findsOneWidget);
    expect(alta.primerosIngresos, isEmpty);
  });

  testWidgets('los campos que rechaza el servidor se pintan debajo del suyo', (t) async {
    final alta = AltaFalsa(
      respuestaAlta: const AltaConErrores({'numeroDocumento': 'Ese documento no es válido'}),
    );
    await montarAlta(t, alta);
    await llenar(t);
    await enviar(t);
    expect(
      find.descendant(
        of: find.byKey(const Key('perfil.numeroDocumento')),
        matching: find.text('Ese documento no es válido'),
      ),
      findsOneWidget,
    );
  });

  testWidgets('el correo de «Crear cuenta» llega propuesto; el documento es de adulto', (t) async {
    final alta = AltaFalsa();
    await montarAlta(t, alta, correo: 'ana@ejemplo.invalid');
    expect(find.text('ana@ejemplo.invalid'), findsOneWidget);
    expect(find.text('Correo de contacto (opcional)'), findsOneWidget);
    await t.tap(find.byKey(const Key('perfil.tipoDocumento')));
    await t.pumpAndSettle();
    expect(find.text('Otro'), findsNothing, reason: 'sólo cédula, extranjería o pasaporte');
    await t.tap(find.text('Pasaporte').last);
    await t.pumpAndSettle();
    await llenar(t);
    await enviar(t);
    final d = alta.primerosIngresos.single;
    expect((d.correo, d.tipoDocumento), ('ana@ejemplo.invalid', 'pasaporte'));
  });

  testWidgets('en blanco, el correo no viaja: es opcional', (t) async {
    final alta = AltaFalsa();
    await montarAlta(t, alta);
    await llenar(t);
    await enviar(t);
    expect(alta.primerosIngresos.single.correo, isNull);
  });

  testWidgets('cambio de vivienda: al titular, el texto del servidor de que no se muda', (t) async {
    lienzoGrande(t);
    const texto =
        'Como titular de su vivienda, no puede cambiarse de vivienda desde la app: pídalo a la '
        'administración.';
    final alta = AltaFalsa(
      respuestaAlta: const AltaRechazada(motivo: 'TITULAR_NO_SE_MUDA', explicacion: texto),
    );
    await t.pumpWidget(
      MaterialApp(
        home: PantallaDeCambioDeVivienda(
          estado: estadoDeAlta(),
          repositorio: alta,
          perfil: perfilDePrueba,
          alCompletar: () {},
        ),
      ),
    );
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const Key('alta.vivienda')), '7');
    await t.enterText(find.byKey(const Key('alta.codigo')), 'MIRA-ABCD-EFGH');
    await t.tap(find.byKey(const Key('alta.enviar')));
    await t.pumpAndSettle();
    expect(alta.cambios.single.codigo, 'MIRA-ABCD-EFGH');
    expect(find.text(texto), findsOneWidget);
  });

  testWidgets('desde el acceso: «Crear cuenta» lleva al primer ingreso con el correo propuesto', (
    t,
  ) async {
    lienzoGrande(t);
    final mundo = Mundo();
    mundo.alta.estados
      ..clear()
      ..add(estadoDeAlta(vinculada: false));
    final (app, _, _) = await mundo.arrancar(conSesion: false);
    await t.pumpWidget(app);
    await t.pumpAndSettle();

    await t.tap(find.byKey(const Key('acceso.crearCuenta')));
    await t.pumpAndSettle();
    expect(find.text('Crear cuenta'), findsWidgets);
    await t.enterText(find.byKey(const Key('registro.usuario')), 'ana.perez');
    await t.enterText(find.byKey(const Key('registro.correo')), 'ana@ejemplo.invalid');
    await t.enterText(find.byKey(const Key('registro.contrasena')), 'Clave#2026');
    await t.enterText(find.byKey(const Key('registro.confirmacion')), 'Clave#2026');
    await t.enterText(find.byKey(const Key('registro.codigoDeInvitacion')), 'MIRA-K7PQ-2XWZ');
    await t.enterText(find.byKey(const Key('registro.fechaNacimiento')), '1990-05-17');
    await t.tap(find.byKey(const Key('registro.acepto')));
    await t.pump();
    await t.tap(find.byKey(const Key('registro.crear')));
    await t.pumpAndSettle();

    expect(mundo.registro.solicitudes, hasLength(1));
    expect(find.text('Complete sus datos'), findsOneWidget);
    expect(find.text('ana@ejemplo.invalid'), findsOneWidget, reason: 'propuesto, no reescrito');
  });
}
