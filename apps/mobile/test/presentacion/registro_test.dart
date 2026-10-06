/// RONDA 15-W · «Crear cuenta», como la ve quien recibió un código de su
/// titular: el botón que no responde antes de tiempo, la política del servidor,
/// los rechazos por campo, el texto genérico del código y la entrada con el
/// PREFIJO del código como código de la copropiedad.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/edad.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/registro.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';
import 'package:ncr_residente/presentacion/pantallas/registro.dart';

import '../dobles/hogar_15w_falso.dart';

final hoy = DateTime.utc(2026, 10, 6, 15);

class RelojFijo implements Reloj {
  @override
  DateTime ahora() => hoy;
}

/// Apunta con qué se entró; puede negarse a abrir la sesión.
class AutenticadorQueApunta implements Autenticador {
  final List<(IdentificadorDeAcceso, String)> accesos = [];
  Fallo? falla;

  @override
  Future<Sesion> iniciarSesion(IdentificadorDeAcceso i, {required String clave}) async {
    final f = falla;
    if (f != null) throw f;
    accesos.add((i, clave));
    return Sesion(
      tokenDeAcceso: 'a',
      tokenDeRefresco: 'r',
      expiraEn: hoy.add(const Duration(minutes: 5)),
      usuarioId: 'u',
      copropiedadId: 'c',
      correo: '',
    );
  }

  @override
  Future<Sesion> renovar(Sesion sesion) async => sesion;
}

void main() {
  late RegistroFalso registro;
  late AutenticadorQueApunta autenticador;
  late List<String> entradas;

  void lienzoGrande(WidgetTester t) {
    t.view.physicalSize = const Size(1000, 2600);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
  }

  Future<void> montar(WidgetTester t) async {
    lienzoGrande(t);
    registro = RegistroFalso();
    autenticador = AutenticadorQueApunta();
    entradas = [];
    final sesion = SesionEnUso(
      almacen: AlmacenEnMemoria(),
      autenticador: autenticador,
      reloj: RelojFijo(),
    );
    await t.pumpWidget(
      MaterialApp(
        home: PantallaDeRegistro(
          servicio: registro,
          sesion: sesion,
          reloj: RelojFijo(),
          alEntrar: entradas.add,
        ),
      ),
    );
    await t.pumpAndSettle();
  }

  bool botonActivo(WidgetTester t) =>
      t.widget<FilledButton>(find.byKey(const Key('registro.crear'))).onPressed != null;

  Future<void> escribir(WidgetTester t, String campo, String texto) async {
    await t.enterText(find.byKey(Key('registro.$campo')), texto);
    await t.pump();
  }

  Future<void> llenarTodo(WidgetTester t) async {
    await escribir(t, 'usuario', 'Ana.Perez');
    await escribir(t, 'correo', 'ana@ejemplo.invalid');
    await escribir(t, 'contrasena', 'Clave#2026');
    await escribir(t, 'confirmacion', 'Clave#2026');
    await escribir(t, 'codigoDeInvitacion', 'mira-k7pq-2xwz');
    await escribir(t, 'fechaNacimiento', '1990-05-17');
    await t.tap(find.byKey(const Key('registro.acepto')));
    await t.pump();
  }

  testWidgets('el botón no responde hasta tener todo, las contraseñas iguales y la casilla', (
    t,
  ) async {
    await montar(t);
    expect(botonActivo(t), isFalse, reason: 'vacío');

    await escribir(t, 'usuario', 'ana.perez');
    await escribir(t, 'correo', 'ana@ejemplo.invalid');
    await escribir(t, 'contrasena', 'Clave#2026');
    await escribir(t, 'confirmacion', 'Clave#2027');
    await escribir(t, 'codigoDeInvitacion', 'MIRA-K7PQ-2XWZ');
    await escribir(t, 'fechaNacimiento', '1990-05-17');
    await t.tap(find.byKey(const Key('registro.acepto')));
    await t.pump();
    expect(botonActivo(t), isFalse, reason: 'las contraseñas no coinciden');
    expect(find.text('Las contraseñas no coinciden'), findsOneWidget);

    await escribir(t, 'confirmacion', 'Clave#2026');
    expect(botonActivo(t), isTrue);

    await t.tap(find.byKey(const Key('registro.acepto')));
    await t.pump();
    expect(botonActivo(t), isFalse, reason: 'sin la casilla no se acepta nada');
    expect(registro.solicitudes, isEmpty);
  });

  testWidgets('la política es la del servidor: se lee su texto y viaja su versión', (t) async {
    await montar(t);
    expect(registro.lecturasDePolitica, 1);
    expect(find.text(politicaDePrueba.texto), findsOneWidget);
    expect(find.text('Pídaselo al titular de su vivienda: lo ve en Ocupantes'), findsOneWidget);

    await llenarTodo(t);
    registro.respuesta = const RegistroRechazado(
      'El código de invitación no es válido o ya se usó',
    );
    await t.tap(find.byKey(const Key('registro.crear')));
    await t.pumpAndSettle();
    final s = registro.solicitudes.single;
    expect(
      (s.versionPolitica, s.codigoDeInvitacion, s.fechaNacimiento),
      (politicaDePrueba.version, 'mira-k7pq-2xwz', '1990-05-17'),
    );
  });

  testWidgets('el código equivocado: el texto genérico del servidor, tal cual, y no se entra', (
    t,
  ) async {
    await montar(t);
    await llenarTodo(t);
    registro.respuesta = const RegistroRechazado(
      'El código de invitación no es válido o ya se usó',
    );
    await t.tap(find.byKey(const Key('registro.crear')));
    await t.pumpAndSettle();
    expect(find.text('El código de invitación no es válido o ya se usó'), findsOneWidget);
    expect(autenticador.accesos, isEmpty);
    expect(entradas, isEmpty);
  });

  testWidgets('los rechazos del servidor se pintan debajo del campo que nombran', (t) async {
    await montar(t);
    await llenarTodo(t);
    registro.respuesta = const RegistroConErrores({
      'usuario': 'Ese usuario no cumple el formato',
      'fechaNacimiento': 'Fecha no válida',
    });
    await t.tap(find.byKey(const Key('registro.crear')));
    await t.pumpAndSettle();
    expect(
      find.descendant(
        of: find.byKey(const Key('registro.usuario')),
        matching: find.text('Ese usuario no cumple el formato'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: find.byKey(const Key('registro.fechaNacimiento')),
        matching: find.text('Fecha no válida'),
      ),
      findsOneWidget,
    );
  });

  testWidgets('si la política cambió, se muestra la nueva y hay que aceptarla otra vez', (t) async {
    await montar(t);
    await llenarTodo(t);
    registro.respuesta = const RegistroConErrores({
      'versionPolitica': 'La política de tratamiento de datos cambió: léala y acéptela de nuevo',
    }, politica: PoliticaDeDatos(version: 'nueva', texto: 'El texto nuevo de la política.'));
    await t.tap(find.byKey(const Key('registro.crear')));
    await t.pumpAndSettle();
    expect(find.text('El texto nuevo de la política.'), findsOneWidget);
    expect(find.textContaining('cambió'), findsOneWidget);
    expect(botonActivo(t), isFalse, reason: 'la casilla se desmarcó');
  });

  testWidgets('creada: entra con el PREFIJO del código y el usuario, y lleva el correo', (t) async {
    await montar(t);
    await llenarTodo(t);
    await t.tap(find.byKey(const Key('registro.crear')));
    await t.pumpAndSettle();
    final (identificador, clave) = autenticador.accesos.single;
    final porUsuario = identificador as PorUsuario;
    expect((porUsuario.codigo, porUsuario.usuario, clave), ('MIRA', 'ana.perez', 'Clave#2026'));
    expect(entradas, ['ana@ejemplo.invalid']);
  });

  testWidgets('creada pero sin poder entrar: se dice, y «Intentar entrar» no la crea otra vez', (
    t,
  ) async {
    await montar(t);
    await llenarTodo(t);
    autenticador.falla = const Fallo(ClaseDeFallo.sinConexion, 'No hay conexión con el servidor.');
    await t.tap(find.byKey(const Key('registro.crear')));
    await t.pumpAndSettle();
    expect(find.textContaining('Su cuenta quedó creada'), findsOneWidget);
    expect(find.byKey(const Key('registro.crear')), findsNothing);

    autenticador.falla = null;
    await t.tap(find.byKey(const Key('registro.entrar')));
    await t.pumpAndSettle();
    expect(registro.solicitudes, hasLength(1), reason: 'la cuenta no se crea dos veces');
    expect(entradas, ['ana@ejemplo.invalid']);
  });

  testWidgets('cortesía: la fecha de un menor se avisa y no viaja', (t) async {
    await montar(t);
    await llenarTodo(t);
    await escribir(t, 'fechaNacimiento', '2012-01-01');
    await t.tap(find.byKey(const Key('registro.crear')));
    await t.pumpAndSettle();
    expect(find.text(mensajeCuentaDeMenor), findsOneWidget);
    expect(registro.solicitudes, isEmpty);
  });

  testWidgets('sin la política no hay casilla: se dice y se puede reintentar', (t) async {
    lienzoGrande(t);
    registro = RegistroFalso()
      ..falloDePolitica = const Fallo(ClaseDeFallo.servidor, 'Demasiados intentos seguidos.');
    await t.pumpWidget(
      MaterialApp(
        home: PantallaDeRegistro(
          servicio: registro,
          sesion: SesionEnUso(
            almacen: AlmacenEnMemoria(),
            autenticador: AutenticadorQueApunta(),
            reloj: RelojFijo(),
          ),
          reloj: RelojFijo(),
          alEntrar: (_) {},
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.byKey(const Key('registro.acepto')), findsNothing);
    expect(find.textContaining('No se pudo cargar la política'), findsOneWidget);

    registro.falloDePolitica = null;
    await t.tap(find.text('Reintentar'));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('registro.acepto')), findsOneWidget);
  });
}
