/// ETAPA 15-I en la app, pantalla por pantalla: el acceso por código, la
/// puerta del primer ingreso, los ocupantes DEFINITIVOS, el vehículo propio
/// con tope, la portería y la entrega del consentimiento al visitante.
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/configuracion/ambiente.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/calidad_de_captura.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/hogar.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';
import 'package:ncr_residente/presentacion/pantallas/acceso.dart';
import 'package:ncr_residente/presentacion/pantallas/nuevo_vehiculo.dart';
import 'package:ncr_residente/presentacion/pantallas/perfil.dart';
import 'package:ncr_residente/presentacion/pantallas/primer_ingreso.dart';
import 'package:ncr_residente/presentacion/pantallas/rostro_del_visitante.dart';

import '../dobles/hogar_falso.dart';

const _prefijoPublicable = 'sb_publishable';
final llavePublicable = '${_prefijoPublicable}_de_prueba';

class AutenticadorQueGuarda implements Autenticador {
  AutenticadorQueGuarda({this.cambio = false});
  bool cambio;
  final List<IdentificadorDeAcceso> identificadores = [];
  int renovaciones = 0;

  Sesion _emitir() => Sesion(
        tokenDeAcceso: 'a',
        tokenDeRefresco: 'r',
        expiraEn: DateTime.now().toUtc().add(const Duration(minutes: 5)),
        usuarioId: 'u',
        copropiedadId: 'c',
        correo: '',
        debeCambiarContrasena: cambio,
      );

  @override
  Future<Sesion> iniciarSesion(IdentificadorDeAcceso i, {required String clave}) async {
    identificadores.add(i);
    return _emitir();
  }

  @override
  Future<Sesion> renovar(Sesion sesion) async {
    renovaciones += 1;
    // Tras el cambio, el gancho emite el token SIN el indicador.
    cambio = false;
    return _emitir();
  }
}

class RelojReal implements Reloj {
  @override
  DateTime ahora() => DateTime.now().toUtc();
}

void main() {
  setUp(() {});

  void lienzoGrande(WidgetTester t) {
    t.view.physicalSize = const Size(1000, 2600);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
  }

  Future<SesionEnUso> sesionCon(AutenticadorQueGuarda a) async {
    final s = SesionEnUso(almacen: AlmacenEnMemoria(), autenticador: a, reloj: RelojReal());
    await s.iniciar(identificador: const PorUsuario(codigo: 'MIRA', usuario: 'a'), clave: 'x');
    return s;
  }

  testWidgets('D1 · código + usuario SIN arroba entra; el código se pide sólo sin correo',
      (t) async {
    lienzoGrande(t);
    final a = AutenticadorQueGuarda();
    final sesion = SesionEnUso(almacen: AlmacenEnMemoria(), autenticador: a, reloj: RelojReal());
    var entro = 0;
    await t.pumpWidget(MaterialApp(
      home: PantallaDeAcceso(
        ambiente: Ambiente(
          apiUrl: 'http://api.invalid',
          supabaseUrl: 'http://supabase.invalid',
          supabaseClavePublicable: llavePublicable,
        ),
        sesion: sesion,
        alEntrar: () => entro += 1,
      ),
    ));

    await t.enterText(find.byKey(const Key('acceso.usuario')), 'casa42.ana');
    await t.enterText(find.byKey(const Key('acceso.clave')), 'Clave#2026');
    await t.tap(find.text('Entrar'));
    await t.pumpAndSettle();
    expect(find.text('Escriba el código de su copropiedad'), findsOneWidget);
    expect(entro, 0);

    await t.enterText(find.byKey(const Key('acceso.codigo')), 'mira');
    await t.tap(find.text('Entrar'));
    await t.pumpAndSettle();
    expect(entro, 1);
    final i = a.identificadores.single as PorUsuario;
    expect((i.codigo, i.usuario), ('MIRA', 'casa42.ana'));

    // La cuenta anterior entra con su correo, sin código.
    await t.enterText(find.byKey(const Key('acceso.codigo')), '');
    await t.enterText(find.byKey(const Key('acceso.usuario')), 'ana@ejemplo.invalid');
    await t.tap(find.text('Entrar'));
    await t.pumpAndSettle();
    expect(a.identificadores.last, isA<PorCorreo>());
  });

  testWidgets('3.2 · primer ingreso: contraseña → formulario → ocupantes DEFINITIVOS → app',
      (t) async {
    lienzoGrande(t);
    final autenticador = AutenticadorQueGuarda(cambio: true);
    final sesion = await sesionCon(autenticador);
    final alta = AltaFalsa(estados: [
      estadoDeAlta(vinculada: false),
      estadoDeAlta(vinculada: true, declarar: true),
      estadoDeAlta(),
    ]);
    final cuenta = CuentaFalsa();
    var termino = 0;
    await t.pumpWidget(MaterialApp(
      home: PuertaDePrimerIngreso(
        sesion: sesion,
        alta: alta,
        cuenta: cuenta,
        alTerminar: () => termino += 1,
        alSalir: () {},
      ),
    ));
    await t.pumpAndSettle();

    // 1 · cambio de contraseña: nada más se ve.
    expect(find.text('Cambie su contraseña'), findsOneWidget);
    expect(alta.consultas, 0, reason: 'con el cambio pendiente ni se consulta el alta');
    await t.enterText(find.byKey(const Key('contrasena.actual')), 'Inicial#2026');
    await t.enterText(find.byKey(const Key('contrasena.nueva')), 'Nueva#2026x');
    await t.enterText(find.byKey(const Key('contrasena.repetida')), 'Nueva#2026x');
    await t.tap(find.text('Cambiar contraseña'));
    await t.pumpAndSettle();
    expect(cuenta.cambios.single, ('Inicial#2026', 'Nueva#2026x'));
    expect(autenticador.renovaciones, 1, reason: 'ADR-023 · se renueva para perder el indicador');

    // 2 · el formulario, con las etiquetas de la copropiedad y «no lo tengo».
    expect(find.text('Complete sus datos'), findsOneWidget);
    expect(find.text('Número de casa'), findsOneWidget);
    await t.enterText(find.byKey(const Key('perfil.nombres')), 'Ana');
    await t.enterText(find.byKey(const Key('perfil.apellidos')), 'Pérez');
    await t.enterText(find.byKey(const Key('perfil.numeroDocumento')), '1000000001');
    await t.enterText(find.byKey(const Key('perfil.correo')), 'ana@ejemplo.invalid');
    await t.enterText(find.byKey(const Key('perfil.telefono')), '+573000000001');
    await t.enterText(find.byKey(const Key('alta.vivienda')), '42');
    await t.tap(find.byKey(const Key('alta.sinCodigo')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('alta.enviar')));
    await t.pumpAndSettle();
    final s = alta.solicitudes.single;
    expect((s.identificador, s.codigo, alta.cambios.single), ('42', null, false));

    // 3 · los ocupantes: el aviso se lee ANTES y otra vez al confirmar.
    expect(find.byKey(const Key('ocupantes.aviso')), findsOneWidget);
    await t.tap(find.byTooltip('Uno más'));
    await t.tap(find.byTooltip('Uno más'));
    await t.pump();
    await t.tap(find.byKey(const Key('ocupantes.declarar')));
    await t.pumpAndSettle();
    expect(find.text(avisoDePrueba), findsNWidgets(2), reason: 'en la pantalla y en el diálogo');
    await t.tap(find.byKey(const Key('ocupantes.confirmar')));
    // Al terminar, la puerta queda en su indicador de carga hasta que el
    // armazón la reemplace: `pumpAndSettle` no se asentaría nunca.
    for (var i = 0; i < 5; i++) {
      await t.pump(const Duration(milliseconds: 50));
    }
    expect(alta.declaraciones.single, 3);

    // 4 · listo: la app.
    expect(termino, 1);
  });

  testWidgets('3.2 · el rechazo del servidor se pinta; «Revisar» no declara nada', (t) async {
    lienzoGrande(t);
    final sesion = await sesionCon(AutenticadorQueGuarda());
    final alta = AltaFalsa(
      estados: [estadoDeAlta(vinculada: true, declarar: true)],
      falloDeclarar: const Fallo(ClaseDeFallo.sinPermiso, 'Ya está fijado: sólo el superadministrador'),
    );
    await t.pumpWidget(MaterialApp(
      home: PuertaDePrimerIngreso(
        sesion: sesion,
        alta: alta,
        cuenta: CuentaFalsa(),
        alTerminar: () {},
        alSalir: () {},
      ),
    ));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('ocupantes.declarar')));
    await t.pumpAndSettle();
    await t.tap(find.text('Revisar'));
    await t.pumpAndSettle();
    expect(alta.declaraciones, isEmpty);

    await t.tap(find.byKey(const Key('ocupantes.declarar')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('ocupantes.confirmar')));
    await t.pumpAndSettle();
    expect(find.text('Ya está fijado: sólo el superadministrador'), findsOneWidget);
  });

  testWidgets('D5 a · el tercer vehículo: el motivo del servidor y a quién pedírselo', (t) async {
    lienzoGrande(t);
    final hogar = HogarFalso(
      respuestaVehiculo: const VehiculoRechazado(
        motivo: 'TOPE_ALCANZADO',
        explicacion: 'Su vivienda ya tiene 2 vehículos propios.',
      ),
    );
    await t.pumpWidget(MaterialApp(
      home: PantallaDeNuevoVehiculo(
        repositorio: hogar,
        ocupantes: const [
          MiembroDeFamilia(
            residenteId: 'r-1',
            nombre: 'Ana Pérez',
            parentesco: null,
            esTitular: true,
            nivelAcceso: null,
            activo: true,
          ),
        ],
        alRegistrar: () {},
      ),
    ));
    await t.enterText(find.byKey(const Key('vehiculo.placa')), 'abc123');
    await t.enterText(find.byKey(const Key('vehiculo.color')), 'Gris');
    await t.enterText(find.byKey(const Key('vehiculo.modelo')), '2020');
    await t.tap(find.byKey(const Key('vehiculo.registrar')));
    await t.pumpAndSettle();
    expect(find.text('Elija al menos un ocupante que use el vehículo'), findsOneWidget);
    expect(hogar.vehiculos, isEmpty);

    await t.tap(find.byKey(const Key('vehiculo.ocupante.r-1')));
    await t.tap(find.byKey(const Key('vehiculo.registrar')));
    await t.pumpAndSettle();
    expect(hogar.vehiculos.single.ocupantes, ['r-1']);
    expect(find.textContaining('Su vivienda ya tiene 2 vehículos propios.'), findsOneWidget);
    expect(find.textContaining('pídaselo a la administración'), findsOneWidget);
  });

  testWidgets('D7 · portería: marca el número; sin número, lo dice', (t) async {
    final llamador = LlamadorFalso();
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (c) => Column(children: [
            TextButton(onPressed: () => llamarAPorteria(c, llamador, '+576015550100'), child: const Text('con')),
            TextButton(onPressed: () => llamarAPorteria(c, llamador, null), child: const Text('sin')),
          ]),
        ),
      ),
    ));
    await t.tap(find.text('con'));
    await t.pump();
    expect(llamador.llamadas.single, '+576015550100');
    await t.tap(find.text('sin'));
    await t.pump();
    expect(find.text('La administración todavía no registró el teléfono de portería.'), findsOneWidget);
    expect(llamador.llamadas, hasLength(1));
  });

  testWidgets('punto 5 · enlace, QR, compartir y estado que se consulta (RN-10)', (t) async {
    lienzoGrande(t);
    final compartidor = CompartidorFalso();
    final hogar = HogarFalso();
    await t.pumpWidget(MaterialApp(
      home: PantallaDeRostroDelVisitante(
        nombreDelVisitante: 'Carlos',
        versionPolitica: 'v1.0',
        tomarFoto: () async => FotoTomada(
          vector: Uint8List.fromList(List<int>.filled(64, 3)),
          medidas: const MedidasDeCaptura(
            nitidez: 0.8,
            iluminacion: 0.5,
            rostrosDetectados: 1,
            proporcionRostro: 0.4,
          ),
        ),
        enviar: (_) async => const CapturaAceptada(
          consentimientoId: 'c-1',
          titular: 'Carlos',
          calidad: 0.9,
          enlaceDeConsentimiento: '/consentimiento/tok',
        ),
        compartidor: compartidor,
        urlDeLaApi: 'http://api.invalid:3000',
        consultarConsentimiento: (id) => hogar.estadoDelConsentimiento(
          autorizacionId: 'a-1',
          consentimientoId: id,
        ),
      ),
    ));
    await t.tap(find.text('Tomar la foto'));
    await t.pumpAndSettle();
    await t.tap(find.text('Pedirle el permiso'));
    await t.pumpAndSettle();

    expect(find.byKey(const Key('consentimiento.qr')), findsOneWidget);
    expect(find.text('http://api.invalid:3000/consentimiento/tok'), findsOneWidget);
    expect(find.text('Pendiente: Carlos aún no responde'), findsOneWidget);
    // No hay casilla de aceptar: el residente entrega, no consiente.
    expect(find.byType(Checkbox), findsNothing);

    await t.tap(find.byKey(const Key('consentimiento.compartir')));
    await t.pump();
    expect(compartidor.compartidos.single, contains('http://api.invalid:3000/consentimiento/tok'));

    hogar.consentimiento = EstadoDeConsentimiento.aceptado;
    await t.tap(find.byKey(const Key('consentimiento.actualizar')));
    await t.pumpAndSettle();
    expect(find.text('Aceptado por Carlos'), findsOneWidget);

    hogar.consentimiento = EstadoDeConsentimiento.rechazado;
    await t.tap(find.byKey(const Key('consentimiento.actualizar')));
    await t.pumpAndSettle();
    expect(find.text('Rechazado por Carlos'), findsOneWidget);
  });
}
