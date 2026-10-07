import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/hogar.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/presentacion/controlador.dart';
import 'package:ncr_residente/presentacion/pantallas/familia.dart';
import 'package:ncr_residente/presentacion/pantallas/historial.dart';
import 'package:ncr_residente/presentacion/pantallas/inicio.dart';
import 'package:ncr_residente/presentacion/pantallas/notificaciones.dart';
import 'package:ncr_residente/presentacion/pantallas/perfil.dart';
import 'package:ncr_residente/presentacion/pantallas/vehiculos.dart';

import '../dobles/hogar_falso.dart';

/// Las cinco pantallas de 11-A, recorridas como las ve el residente.
///
/// No comprueban «que pinte algo»: comprueban las decisiones que se tomaron
/// sobre el mockup —el botón que el servidor deshabilita, el residente
/// desactivado que sigue apareciendo, el motivo de la negación, el interruptor
/// que no se puede mover— porque son justo las que una revisión visual deja
/// pasar.
class RepositorioFalso implements RepositorioDelResidente {
  RepositorioFalso({
    this.puedeAutorizar = true,
    this.activa = true,
    this.zonas = const [],
    this.respuesta,
    this.falloAlCrear,
    this.recientes = const [],
  });
  final bool puedeAutorizar;
  final bool activa;
  final List<ZonaComun> zonas;

  /// Qué contesta el conjunto al crear o al volver a autorizar. `null` =
  /// aceptada.
  final ResultadoDeVisita? respuesta;

  /// Un fallo de TRANSPORTE, que es cosa distinta de un rechazo de negocio.
  final Fallo? falloAlCrear;

  /// F6 · lo que devuelve «últimos visitantes».
  final List<VisitanteReciente> recientes;

  final List<NuevaVisita> creadas = [];
  final List<AparatoDeNotificaciones> aparatos = [];

  /// Cada «volver a autorizar», con lo que se pidió.
  final List<({String autorizacionId, DateTime inicio, int duracion, bool casilla, String clave})>
      repeticiones = [];

  @override
  Future<MiHogar> miHogar() async => MiHogar(
        vivienda: Vivienda(
          id: 'v',
          identificador: '42',
          agrupacion: 'B',
          etiquetaVivienda: 'Casa',
          etiquetaAgrupacion: 'Manzana',
          direccion: 'Calle inventada 00',
          copropiedadNombre: 'Conjunto de prueba',
          estadoAdministrativo: 'al_dia',
          activa: activa,
        ),
        vinculo: const Vinculo(
          residenteId: 'r',
          esTitular: true,
          nivelAcceso: 'acceso_completo',
        ),
        puedeAutorizar: puedeAutorizar,
      );

  @override
  Future<List<MiembroDeFamilia>> miFamilia() async => const [
        MiembroDeFamilia(
          residenteId: 'r1',
          nombre: 'Maria Titular',
          parentesco: 'Propietario',
          esTitular: true,
          nivelAcceso: 'acceso_completo',
          activo: true,
        ),
        MiembroDeFamilia(
          residenteId: 'r2',
          nombre: 'Antiguo Residente',
          parentesco: 'Hijo',
          esTitular: false,
          nivelAcceso: 'solo_ingreso',
          activo: false,
        ),
      ];

  @override
  Future<List<Vehiculo>> misVehiculos() async => const [
        Vehiculo(
          id: 'veh',
          placa: 'ABC123',
          marca: 'Marca',
          modelo: 'Modelo',
          color: 'Blanco',
          esPrincipal: true,
          activo: true,
        ),
      ];

  @override
  Future<List<Autorizacion>> misAutorizaciones() async => [
        Autorizacion(
          id: 'a',
          visitante: 'Visitante propio',
          tipo: 'unica',
          desde: DateTime.utc(2026, 9, 18, 10),
          hasta: DateTime.utc(2026, 9, 18, 14),
          placa: 'DEF456',
          permiteAccesoVehicular: true,
          estado: 'activa',
          acompanantes: 1,
        ),
      ];

  @override
  Future<List<EventoDeAcceso>> miHistorial(PeriodoDeHistorial periodo) async => [
        EventoDeAcceso(
          id: 'e',
          ocurridoEn: DateTime.utc(2026, 9, 18, 9),
          tipo: 'acceso',
          resultado: 'negado',
          motivo: 'FUERA_DE_HORARIO',
          metodo: 'placa',
          placaDetectada: 'DEF456',
          persona: 'Visitante propio',
          zona: 'Piscina',
          decididoPorEdge: true,
        ),
      ];

  @override
  Future<List<ZonaComun>> misZonas() async => zonas;

  @override
  Future<ResultadoDeVisita> crearVisita(NuevaVisita visita) async {
    if (falloAlCrear != null) throw falloAlCrear!;
    creadas.add(visita);
    return respuesta ?? const VisitaCreada(id: 'a-1', repetida: false);
  }

  @override
  Future<void> registrarAparato(AparatoDeNotificaciones aparato) async {
    aparatos.add(aparato);
  }

  @override
  Future<List<VisitanteReciente>> ultimosVisitantes() async => recientes;

  @override
  Future<ResultadoDeVisita> volverAAutorizar({
    required String autorizacionId,
    required DateTime inicio,
    required int duracionMinutos,
    required bool casillaMarcada,
    required String claveDeIdempotencia,
  }) async {
    if (falloAlCrear != null) throw falloAlCrear!;
    repeticiones.add((
      autorizacionId: autorizacionId,
      inicio: inicio,
      duracion: duracionMinutos,
      casilla: casillaMarcada,
      clave: claveDeIdempotencia,
    ));
    return respuesta ?? const VisitaCreada(id: 'a-2', repetida: false, equipos: 1, sincronizadas: 1);
  }
}

Widget envolver(Widget hijo) => MaterialApp(home: hijo);

void main() {
  testWidgets('M-1 · la vivienda, el distintivo y la actividad reciente', (t) async {
    final repo = RepositorioFalso();
    final inicio = controladorDeInicio(repo);
    final autorizaciones = controladorDeAutorizaciones(repo);
    await inicio.cargarAhora();
    await autorizaciones.cargarAhora();

    await t.pumpWidget(
      envolver(
        PantallaDeInicio(
          controlador: inicio,
          autorizaciones: autorizaciones,
          alPedirAcceso: () {},
          alRegistrarVisita: () {},
          alAbrirFamilia: () {},
          alAbrirHistorial: () {},
          alAbrirVehiculos: () {},
        ),
      ),
    );
    await t.pumpAndSettle();

    expect(find.text('Casa 42 · Manzana B'), findsOneWidget);
    expect(find.text('Al día'), findsOneWidget);
    expect(find.text('Registrar visita'), findsOneWidget);

    // La actividad reciente vive al final de un `ListView`: en una pantalla de
    // prueba de 600 px no está construida hasta que se desplaza. Buscarla sin
    // desplazar daría un falso negativo — y, peor, un falso POSITIVO el día que
    // alguien la borre y la prueba siga buscando algo que nunca estuvo a la
    // vista.
    // `scrollable:` explícito: la pantalla tiene DOS —el `ListView` de fuera y
    // el `GridView` de los accesos rápidos—, y sin decir cuál, el ayudante de
    // Flutter falla con «Too many elements», que no dice nada de la causa.
    await t.scrollUntilVisible(
      find.text('Visitante propio'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Visitante propio'), findsOneWidget);
  });

  testWidgets('M-1 · con la vivienda inactiva, se explica y el botón no está activo',
      (t) async {
    final repo = RepositorioFalso(puedeAutorizar: false, activa: false);
    final inicio = controladorDeInicio(repo);
    final autorizaciones = controladorDeAutorizaciones(repo);
    await inicio.cargarAhora();
    await autorizaciones.cargarAhora();

    await t.pumpWidget(
      envolver(
        PantallaDeInicio(
          controlador: inicio,
          autorizaciones: autorizaciones,
          alPedirAcceso: () {},
          alRegistrarVisita: () {},
          alAbrirFamilia: () {},
          alAbrirHistorial: () {},
          alAbrirVehiculos: () {},
        ),
      ),
    );
    await t.pumpAndSettle();

    expect(find.textContaining('Su vivienda está inactiva'), findsOneWidget);
    // El botón sigue visible —esconderlo dejaría al residente buscándolo— y no
    // responde. Se comprueba sobre el `InkWell`, que es quien recibe el toque:
    // un `Semantics` de adorno podría decir «habilitado» con el `onTap` nulo.
    final inkwell = t.widget<InkWell>(
      find.ancestor(of: find.text('Registrar visita'), matching: find.byType(InkWell)).first,
    );
    expect(inkwell.onTap, isNull);

    // Y el de un acceso que sí funciona, para que la aserción de arriba no pase
    // por estar mirando un widget que nunca tiene `onTap`.
    final vehiculos = t.widget<InkWell>(
      find.ancestor(of: find.text('Mis vehículos'), matching: find.byType(InkWell)).first,
    );
    expect(vehiculos.onTap, isNotNull);
  });

  testWidgets('M-2 · el residente desactivado aparece marcado (RN-19)', (t) async {
    final c = controladorDeFamilia(RepositorioFalso());
    await c.cargarAhora();

    await t.pumpWidget(envolver(PantallaDeFamilia(controlador: c, alPedirAcceso: () {})));
    await t.pumpAndSettle();

    expect(find.text('Maria Titular'), findsOneWidget);
    expect(find.text('Antiguo Residente'), findsOneWidget);
    expect(find.text('Desactivado'), findsOneWidget);
    // Y el conteo cuenta los ACTIVOS, no las filas.
    expect(find.text('1 residente(s) en su vivienda'), findsOneWidget);
    expect(find.textContaining('sólo el titular de la vivienda puede autorizar'), findsOneWidget);
  });

  testWidgets('M-3 · la placa se muestra como la normalizó el dominio', (t) async {
    final c = controladorDeVehiculos(RepositorioFalso());
    await c.cargarAhora();

    await t.pumpWidget(envolver(Scaffold(body: PantallaDeVehiculos(controlador: c, alPedirAcceso: () {}))));
    await t.pumpAndSettle();

    expect(find.text('ABC123'), findsOneWidget);
    expect(find.text('Principal'), findsOneWidget);
    expect(find.text('Marca · Modelo · Blanco'), findsOneWidget);
  });

  testWidgets('M-6 · el motivo de la negación se explica, y lo del Edge se marca', (t) async {
    final c = ControladorDeHistorial(RepositorioFalso());
    await c.cargarAhora();

    await t.pumpWidget(envolver(PantallaDeHistorial(controlador: c, alPedirAcceso: () {})));
    await t.pumpAndSettle();

    // El mockup solo ponía el distintivo «Denegado»: el residente tiene derecho
    // a saber por qué.
    expect(find.text('La zona estaba cerrada a esa hora'), findsOneWidget);
    expect(find.text('Decidido en el conjunto, sin nube'), findsOneWidget);
    expect(find.text('Hoy'), findsOneWidget);
  });

  testWidgets('M-6 · un motivo desconocido se muestra tal cual, no como texto genérico', (t) async {
    expect(motivoLegible('MOTIVO_QUE_AUN_NO_EXISTE'), 'MOTIVO_QUE_AUN_NO_EXISTE');
    expect(motivoLegible('LISTA_NEGRA'), 'La persona o la placa está en lista negra');
  });

  testWidgets('M-8 · ningún interruptor de avisos: la verdad en una frase (15-L)', (t) async {
    final repo = RepositorioFalso();
    final inicio = controladorDeInicio(repo);
    await inicio.cargarAhora();
    final perfil = ControladorDeVista<PerfilDelResidente>(leer: HogarFalso().miPerfil);
    await perfil.cargarAhora();
    final ocupantes = ControladorDeVista<MisOcupantes>(leer: AltaFalsa().misOcupantes);
    await ocupantes.cargarAhora();
    final llamador = LlamadorFalso();

    await t.pumpWidget(
      envolver(
        Scaffold(
          body: PantallaDePerfil(
            controladorDeInicio: inicio,
            controladorDePerfil: perfil,
            controladorDeOcupantes: ocupantes,
            llamador: llamador,
            alCerrarSesion: () {},
            alAbrirFamilia: () {},
            alAbrirHistorial: () {},
            alAbrirVehiculos: () {},
            alAbrirNotificaciones: () {},
            alEditarPerfil: (_) {},
            alCambiarVivienda: (_) {},
            alCambiarContrasena: () {},
          ),
        ),
      ),
    );
    await t.pumpAndSettle();

    // 3.5 · el nombre de la PERSONA, no el correo de la sesión (C-36).
    expect(find.text('Ana Pérez'), findsWidgets);
    expect(find.text('Casa 42 · Manzana B · Titular'), findsOneWidget);
    // La copropiedad, de solo lectura, y «Ocupantes» con el cupo de las plazas (15-W).
    expect(find.text('Calle inventada 00'), findsOneWidget);
    await t.scrollUntilVisible(find.byKey(const Key('perfil.ocupantes')), 200,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Plazas: 2 de 4 · 1 libre con código'), findsOneWidget);

    // En 11-A las notificaciones eran dos interruptores apagados; en 11-B, el
    // estado del registro push. Esta compilación no lleva servicio de
    // mensajería (15-L): la fila dice lo que es verdad y ningún interruptor
    // promete otra cosa, tampoco uno deshabilitado.
    await t.scrollUntilVisible(find.text('Notificaciones'), 200,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Notificaciones'), findsOneWidget);
    expect(find.text(avisosConLaAppAbierta), findsOneWidget);
    expect(find.byType(SwitchListTile), findsNothing);
    expect(find.byType(Switch), findsNothing);
  });
}
