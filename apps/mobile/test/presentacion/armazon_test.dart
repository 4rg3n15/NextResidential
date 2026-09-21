import 'package:flutter/material.dart';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/configuracion/ambiente.dart';
import 'package:ncr_residente/dominio/calidad_de_captura.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';
import 'package:ncr_residente/presentacion/app.dart';

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
  Future<Sesion> iniciarSesion({required String correo, required String clave}) async =>
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

  final List<String> capturas = [];
@override
  Future<ResultadoDeCaptura> capturarRostro({
    required String autorizacionId,
    required MedidasDeCaptura medidas,
    required Uint8List vector,
    required String versionPolitica,
    required DateTime suprimirEn,
  }) async {
    capturas.add(autorizacionId);
    return const CapturaAceptada(
      consentimientoId: 'c-1',
      titular: 'Visitante de prueba',
      calidad: 0.8,
    );
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

  setUp(() async {
    bitacora.clear();
    reloj = RelojFijo(DateTime.utc(2026, 9, 18, 12));
    final almacen = AlmacenEnMemoria();
    sesion = SesionEnUso(
      almacen: almacen,
      autenticador: AutenticadorQueAnota(reloj),
      reloj: reloj,
    );
    await sesion.iniciar(correo: 'x@y.invalid', clave: 'z');
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

  testWidgets('al volver con el token fresco, no renueva ni recarga de más', (t) async {
    await t.pumpWidget(AppDelResidente(dependencias: dependencias));
    await t.pumpAndSettle();
    bitacora.clear();

    // Un minuto fuera: nada que renovar y nada que recargar.
    reloj.avanzar(const Duration(minutes: 1));
    final estado = t.state<State<Armazon>>(find.byType(Armazon)) as dynamic;
    await estado.alVolverAPrimerPlano();
    await t.pumpAndSettle();

    expect(bitacora, isEmpty);
  });

  testWidgets('sin sesión, la app empieza pidiendo acceso', (t) async {
    await sesion.cerrar();
    await t.pumpWidget(AppDelResidente(dependencias: dependencias));
    await t.pumpAndSettle();

    expect(find.text('Acceso del residente'), findsOneWidget);
    expect(bitacora, isEmpty);
  });
}
