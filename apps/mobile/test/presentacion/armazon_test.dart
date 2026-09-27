import 'package:flutter/material.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/configuracion/ambiente.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/notificaciones.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';
import 'package:ncr_residente/presentacion/app.dart';
import 'package:ncr_residente/presentacion/widgets/foto_del_visitante.dart';

import '../dobles/hogar_falso.dart';
import '../dobles/sincronizacion.dart';
import '../dobles/visitas.dart';

/// EL ORDEN AL VOLVER A PRIMER PLANO
///
/// La condición que el usuario puso por escrito: «refresca al volver a primer
/// plano, no de forma perezosa al recibir un 401». Comprobar que *se refresca*
/// no basta —también se refresca con la estrategia perezosa, solo que tarde—:
/// lo que hay que demostrar es que **la renovación ocurre ANTES de la primera
/// lectura**. Por eso las dos piezas escriben en la misma bitácora y la prueba
/// mira el orden.
///
/// Si alguien invirtiera las dos líneas de `alVolverAPrimerPlano()`, ninguna
/// aserción sobre «¿renovó?» fallaría. Esta sí.
final bitacora = <String>[];

/// Ver `tema_test.dart`: la llave se compone para no dejar su forma escrita.
const _prefijoPublicable = 'sb_publishable';
final llavePublicable = '${_prefijoPublicable}_de_prueba';

class RelojFijo implements Reloj {
  RelojFijo(this._ahora);
  DateTime _ahora;
  void avanzar(Duration d) => _ahora = _ahora.add(d);
  @override
  DateTime ahora() => _ahora;
}

class AutenticadorQueAnota implements Autenticador {
  AutenticadorQueAnota(this._reloj);
  final RelojFijo _reloj;

  Sesion _emitir() => Sesion(
        tokenDeAcceso: 'nuevo',
        tokenDeRefresco: 'nuevo',
        expiraEn: _reloj.ahora().add(const Duration(minutes: 5)),
        usuarioId: 'u',
        copropiedadId: 'c',
        correo: 'residente@ejemplo.invalid',
      );

  @override
  Future<Sesion> iniciarSesion(IdentificadorDeAcceso identificador, {required String clave}) async =>
      _emitir();

  @override
  Future<Sesion> renovar(Sesion sesion) async {
    bitacora.add('renovar');
    return _emitir();
  }
}

class RepositorioQueAnota implements RepositorioDelResidente {
  @override
  Future<MiHogar> miHogar() async {
    bitacora.add('leer:hogar');
    return const MiHogar(
      vivienda: Vivienda(
        id: 'v',
        identificador: '42',
        agrupacion: 'B',
        etiquetaVivienda: 'Casa',
        etiquetaAgrupacion: 'Manzana',
        direccion: null,
        copropiedadNombre: 'Conjunto de prueba',
        estadoAdministrativo: 'al_dia',
        activa: true,
      ),
      vinculo: Vinculo(residenteId: 'r', esTitular: true, nivelAcceso: 'acceso_completo'),
      puedeAutorizar: true,
    );
  }

  @override
  Future<List<MiembroDeFamilia>> miFamilia() async {
    bitacora.add('leer:familia');
    return const [];
  }

  @override
  Future<List<Vehiculo>> misVehiculos() async {
    bitacora.add('leer:vehiculos');
    return const [];
  }

  @override
  Future<List<Autorizacion>> misAutorizaciones() async {
    bitacora.add('leer:autorizaciones');
    return const [];
  }

  @override
  Future<List<EventoDeAcceso>> miHistorial(PeriodoDeHistorial periodo) async {
    bitacora.add('leer:historial');
    return const [];
  }

  @override
  Future<List<ZonaComun>> misZonas() async {
    bitacora.add('leer:zonas');
    return const [];
  }

  @override
  Future<ResultadoDeVisita> crearVisita(NuevaVisita visita) async {
    bitacora.add('escribir:visita:${visita.claveDeIdempotencia}');
    return const VisitaCreada(id: 'a-1', repetida: false);
  }

  @override
  Future<void> registrarAparato(AparatoDeNotificaciones aparato) async {
    bitacora.add('escribir:aparato:${aparato.token}');
  }

  @override
  Future<List<VisitanteReciente>> ultimosVisitantes() async {
    bitacora.add('leer:ultimos');
    return [recienteDePrueba()];
  }

  @override
  Future<ResultadoDeVisita> volverAAutorizar({
    required String autorizacionId,
    required DateTime inicio,
    required int duracionMinutos,
    required bool casillaMarcada,
    required String claveDeIdempotencia,
  }) async {
    bitacora.add(
      'escribir:repeticion:$autorizacionId:$duracionMinutos:$casillaMarcada:$claveDeIdempotencia',
    );
    return const VisitaCreada(id: 'a-2', repetida: false, equipos: 2, sincronizadas: 2);
  }
}

/// 15-L · las notificaciones de la API, apuntando cada lectura en la bitácora.
class NotificacionesQueAnotan extends NotificacionesFalsas {
  @override
  Future<List<Notificacion>> misNotificaciones() {
    bitacora.add('leer:notificaciones');
    return super.misNotificaciones();
  }
}

/// Fuente de avisos gobernada: el permiso y el token se deciden en la prueba,
/// que es la única forma de ejercer los cinco estados de M-7 sin un teléfono
/// con Google Play.
class FuenteGobernada implements FuenteDeNotificaciones {
  FuenteGobernada({this.concede = true, this.token = 'tok-1'});
  bool concede;
  String? token;

  @override
  Future<bool> pedirPermiso() async {
    bitacora.add('avisos:permiso');
    return concede;
  }

  @override
  Future<AparatoDeNotificaciones?> aparato() async {
    bitacora.add('avisos:aparato');
    final t = token;
    if (t == null) return null;
    return AparatoDeNotificaciones(
      instalacionId: 'inst-1',
      token: t,
      plataforma: PlataformaDelAparato.android,
    );
  }
}

void main() {
  late RelojFijo reloj;
  late SesionEnUso sesion;
  late Dependencias dependencias;
  late AltaFalsa alta;

  setUp(() async {
    bitacora.clear();
    alta = AltaFalsa();
    reloj = RelojFijo(DateTime.utc(2026, 9, 18, 12));
    final almacen = AlmacenEnMemoria();
    sesion = SesionEnUso(
      almacen: almacen,
      autenticador: AutenticadorQueAnota(reloj),
      reloj: reloj,
    );
    await sesion.iniciar(identificador: PorCorreo('x@y.invalid'), clave: 'z');
    dependencias = Dependencias(
      ambiente: Ambiente(
        apiUrl: 'http://api.invalid',
        supabaseUrl: 'http://supabase.invalid',
        supabaseClavePublicable: llavePublicable,
      ),
      sesion: sesion,
      repositorio: RepositorioQueAnota(),
      reloj: reloj,
      notificaciones: FuenteGobernada(),
      claves: () => 'clave-fija-de-prueba',
      alta: alta,
      hogar: HogarFalso(),
      cuenta: CuentaFalsa(),
      llamador: LlamadorFalso(),
      servidor: cambioDeServidor(sesion),
      notificacionesDelConjunto: NotificacionesQueAnotan(),
    );
  });

  testWidgets('con sesión, arranca en el armazón y carga la vivienda', (t) async {
    await t.pumpWidget(AppDelResidente(dependencias: dependencias));
    await t.pumpAndSettle();

    expect(find.text('Casa 42 · Manzana B'), findsOneWidget);
    expect(bitacora, contains('leer:hogar'));
  });

  testWidgets('al volver a primer plano con el token vencido, RENUEVA ANTES de leer', (t) async {
    await t.pumpWidget(AppDelResidente(dependencias: dependencias));
    await t.pumpAndSettle();
    bitacora.clear();

    // Tres horas suspendida: el token de 5 minutos está muerto.
    reloj.avanzar(const Duration(hours: 3));
    final estado = t.state<State<Armazon>>(find.byType(Armazon)) as dynamic;
    await estado.alVolverAPrimerPlano();
    await t.pumpAndSettle();

    expect(bitacora.first, 'renovar', reason: 'la renovación tiene que ir primero');
    expect(bitacora.where((e) => e.startsWith('leer:')), isNotEmpty);
    final primeraLectura = bitacora.indexWhere((e) => e.startsWith('leer:'));
    expect(
      bitacora.indexOf('renovar') < primeraLectura,
      isTrue,
      reason: 'ninguna lectura puede salir antes de la renovación',
    );
  });

  testWidgets('15-L · al volver con el token fresco, NO renueva pero SÍ recarga lo visible',
      (t) async {
    await t.pumpWidget(AppDelResidente(dependencias: dependencias));
    await t.pumpAndSettle();
    bitacora.clear();

    // Un minuto fuera: nada que renovar. Antes tampoco se recargaba —el dato
    // tenía menos de dos minutos— y en ese minuto portería pudo rechazar una
    // visita. Ahora se recarga SIEMPRE lo que se ve.
    reloj.avanzar(const Duration(minutes: 1));
    final estado = t.state<State<Armazon>>(find.byType(Armazon)) as dynamic;
    await estado.alVolverAPrimerPlano();
    await t.pumpAndSettle();

    expect(bitacora, isNot(contains('renovar')));
    expect(bitacora, containsAll(['leer:hogar', 'leer:autorizaciones', 'leer:notificaciones']));
    // Lo que NO se ve no se pide: la pestaña de zonas está cerrada.
    expect(bitacora, isNot(contains('leer:zonas')));
  });

  testWidgets('sin sesión, la app empieza pidiendo acceso', (t) async {
    await sesion.cerrar();
    await t.pumpWidget(AppDelResidente(dependencias: dependencias));
    await t.pumpAndSettle();

    expect(find.text('Acceso del residente'), findsOneWidget);
    expect(bitacora, isEmpty);
  });

  testWidgets('3.2 · con el alta sin completar, NO se ve ni se carga la app', (t) async {
    alta.estados
      ..clear()
      ..add(estadoDeAlta(vinculada: false));
    await t.pumpWidget(AppDelResidente(dependencias: dependencias));
    await t.pumpAndSettle();

    expect(find.text('Complete sus datos'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(bitacora.where((e) => e.startsWith('leer:')), isEmpty,
        reason: 'ninguna pantalla de la app pide datos antes de completar el alta');
  });

  testWidgets('S-59 · sesión recuperada sin red: pasa a la app, que pinta su estado', (t) async {
    alta.falloConsulta = const Fallo(ClaseDeFallo.sinConexion, 'sin red');
    await t.pumpWidget(AppDelResidente(dependencias: dependencias));
    await t.pumpAndSettle();

    expect(find.byType(NavigationBar), findsOneWidget);
  });

  testWidgets('M-1 · «Registrar visita» abre el formulario de la foto y la casilla', (t) async {
    // El formulario es largo: en 600 px la foto no llega a construirse.
    t.view.physicalSize = const Size(1000, 3000);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(AppDelResidente(dependencias: dependencias));
    await t.pumpAndSettle();

    await t.tap(find.text('Registrar visita'));
    await t.pumpAndSettle();

    // Ya no es un aviso de «llega más adelante»: es el formulario de verdad.
    expect(find.text('Nuevo visitante'), findsOneWidget);
    expect(find.byType(FotoDelVisitante), findsOneWidget);
  });

  testWidgets('F6 · «Volver a autorizar» desde la pestaña: la visita anterior y la clave al abrir',
      (t) async {
    t.view.physicalSize = const Size(1000, 2400);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(AppDelResidente(dependencias: dependencias));
    await t.pumpAndSettle();

    await t.tap(find.text('Visitantes'));
    await t.pumpAndSettle();
    expect(find.text('Últimos visitantes'), findsOneWidget);
    expect(find.text('Plomero Pérez'), findsOneWidget);

    await t.tap(find.text('Volver a autorizar'));
    await t.pumpAndSettle();

    // Sólo cuándo, cuánto y la casilla: nada que escribir y ninguna foto.
    expect(find.byType(TextFormField), findsNothing);
    expect(find.byType(FotoDelVisitante), findsNothing);
    expect(find.byType(DropdownButtonFormField<int>), findsOneWidget);
    expect(find.byType(Checkbox), findsOneWidget);

    await t.tap(find.text(textoDeLaCasilla));
    await t.pump();
    await t.tap(find.text('Autorizar de nuevo'));
    await t.pumpAndSettle();

    expect(
      bitacora,
      contains('escribir:repeticion:aut-7:120:true:clave-fija-de-prueba'),
      reason: 'la autorización de la visita ANTERIOR, la duración elegida y la clave de la app',
    );
    expect(find.text('Visita autorizada'), findsOneWidget);
    expect(find.textContaining('La foto quedó en 2 de 2 equipos'), findsOneWidget);
  });
}
