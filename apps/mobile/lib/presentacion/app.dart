/// El armazón de la app: navegación, sesión, el ciclo de vida y la recarga.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// AQUÍ VIVE LA CONDICIÓN QUE EL USUARIO PUSO POR ESCRITO
///
/// «Refresca al volver a primer plano, no de forma perezosa al recibir un 401.
/// Eso es lo que tumba una sesión tras la suspensión de la app.»
///
/// `_Armazon` implementa `WidgetsBindingObserver` y en
/// `AppLifecycleState.resumed` hace **dos** cosas, en este orden:
///
///   1. `sesion.alVolverAPrimerPlano()` — renueva si la política dice que toca.
///   2. Recarga lo que hay en pantalla. **Siempre** (15-L): antes sólo si el
///      dato tenía más de dos minutos, y eso dejaba al residente mirando una
///      visita «vigente» que portería había rechazado hacía uno.
///
/// El orden no es negociable: recargar primero enviaría la petición con el
/// token vencido, que es el 401 que se quiere evitar.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// 15-L · AL DÍA CON LA CONSOLA, SIN TOCAR NADA
///
/// «La información de la app debe sincronizarse con la de la consola web.»
/// Mientras la app está en primer plano, un `CicloDeRecarga` vuelve cada 20 s
/// a pedir LO QUE SE VE —la pestaña o la pantalla abierta encima—, además de
/// las notificaciones (el contador de Inicio) y la bandeja de salida. En cada
/// vuelta, primero `asegurar()` la sesión y DESPUÉS pedir: el mismo orden de
/// arriba. En segundo plano se detiene; ante fallos se espacia hasta 2 min.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LA NAVEGACIÓN ES LA DEL MOCKUP
///
/// `03-mockups.md` §3 fija cinco pestañas —Inicio · Visitantes · Vehículos ·
/// Zonas · Perfil— y deja Mi Familia, Historial y Notificaciones fuera de la
/// barra, alcanzables desde Inicio y Perfil. Se respeta.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../aplicacion/avisos_en_uso.dart';
import '../aplicacion/envio_de_visitas.dart';
import '../aplicacion/notificaciones_vistas.dart';
import '../aplicacion/servidor_en_uso.dart';
import '../aplicacion/sesion_en_uso.dart';
import '../configuracion/tema.dart';
import '../dominio/causa_de_red.dart';
import '../dominio/puertos.dart';
import '../infraestructura/almacen/almacen_de_texto.dart';
import '../infraestructura/bandeja/bandeja_guardada.dart';
import '../infraestructura/camara/fuente_de_fotos.dart';
import 'acciones_de_visitas.dart';
import 'acciones_del_hogar.dart';
import 'contador_de_notificaciones.dart';
import 'controlador.dart';
import 'dependencias.dart';
import 'pantallas/acceso.dart';
import 'pantallas/familia.dart';
import 'pantallas/historial.dart';
import 'pantallas/notificaciones.dart';
import 'pantallas/primer_ingreso.dart';
import 'pestanas.dart';
import 'sincronizacion_de_la_app.dart';
import 'widgets/servidor.dart';

export 'dependencias.dart';

class AppDelResidente extends StatelessWidget {
  const AppDelResidente({super.key, required this.dependencias});
  final Dependencias dependencias;

  @override
  Widget build(BuildContext context) {
    // Por ENCIMA de la navegación: toda pantalla, también las que se abren
    // encima de las pestañas, encuentra «Cambiar servidor» en su contexto.
    return ServidorDeLaApp(
      cambio: dependencias.servidor,
      child: MaterialApp(
        title: 'Next Control Residencial',
        debugShowCheckedModeBanner: false,
        theme: temaClaro(),
        darkTheme: temaOscuro(),
        home: Armazon(dependencias: dependencias),
      ),
    );
  }
}

class Armazon extends StatefulWidget {
  const Armazon({super.key, required this.dependencias});
  final Dependencias dependencias;

  @override
  State<Armazon> createState() => _ArmazonState();
}

class _ArmazonState extends State<Armazon> with WidgetsBindingObserver {
  Dependencias get _d => widget.dependencias;
  RepositorioDelResidente get _repo => _d.repositorio;
  SesionEnUso get _sesion => _d.sesion;
  DireccionDelServidor get _direccion => _d.servidor.direccion;

  late final _c = ControladoresDelArmazon(
    repo: _repo,
    hogar: _d.hogar,
    alta: _d.alta,
    notificaciones: _d.notificacionesDelConjunto,
  );
  late final AccionesDelHogar _acciones = AccionesDelHogar(
    sesion: _sesion,
    alta: _d.alta,
    hogar: _d.hogar,
    cuenta: _d.cuenta,
    familia: _c.familia,
    vehiculos: _c.vehiculos,
    perfil: _c.perfil,
    alCambiarDeVivienda: _cargarTodo,
  );
  late final ControladorDeAvisos _avisos = ControladorDeAvisos(
    fuente: _d.notificaciones,
    repositorio: _repo,
    reloj: _d.reloj,
  );
  late final AlmacenDeTexto _almacen = _d.almacen ?? AlmacenDeTextoEnMemoria();
  late final ContadorDeNotificaciones _sinVer = ContadorDeNotificaciones(
    controlador: _c.notificaciones,
    vistas: NotificacionesVistas(almacen: _almacen),
  );
  late final EnvioDeVisitas _envio = EnvioDeVisitas(
    repositorio: _repo,
    reloj: _d.reloj,
    almacen: BandejaGuardada(_almacen),
    propietario: _propietario,
  );
  late final AccionesDeVisitas _visitas = AccionesDeVisitas(
    envio: _envio,
    repositorio: _repo,
    reloj: _d.reloj,
    claves: _d.claves,
    // La cámara real si la hay; si no, la simulada y declarada como tal.
    tomarFoto: _d.tomarFoto ?? CamaraSimulada().tomar,
    conSesion: _conSesion,
    alCambiarLaBandeja: () => mounted ? setState(() {}) : null,
    recargarVisitas: () {
      unawaited(_c.autorizaciones.refrescar());
      unawaited(_c.ultimos.refrescar());
    },
  );
  late final SincronizacionDeLaApp _sincronia = SincronizacionDeLaApp(
    sesion: _sesion,
    controladores: _c,
    pestana: () => _pestana,
    vaciarBandeja: () => mounted ? _visitas.vaciarBandeja(context) : Future.value(),
    alPerderLaSesion: _pedirAcceso,
    intervalo: _d.intervaloDeRecarga,
  );
  StreamSubscription<TipoDeRed>? _red;

  int _pestana = 0;
  bool _autenticado = false;

  /// 3.2 · hasta que la puerta del primer ingreso diga «listo», no se ve ni se
  /// carga ninguna otra pantalla.
  bool _primerIngresoHecho = false;

  /// La sesión vino del llavero al arrancar (S-59), no de un acceso de ahora.
  bool _recuperada = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _autenticado = _sesion.haySesion;
    _recuperada = _autenticado;
    _direccion.addListener(_alCambiarServidor);
    _red = _d.cambiosDeRed?.listen(_sincronia.alCambiarDeRed);
    unawaited(_recuperarLoGuardado());
  }

  @override
  void dispose() {
    _sincronia.alPasarASegundoPlano();
    unawaited(_red?.cancel());
    _direccion.removeListener(_alCambiarServidor);
    _sinVer.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// La bandeja y las notificaciones vistas de antes de cerrar la app.
  Future<void> _recuperarLoGuardado() async {
    await Future.wait([_envio.recuperar(), _sinVer.recuperar()]);
    if (mounted) setState(() {});
  }

  String? _propietario() {
    final s = _sesion.sesion;
    return s == null ? null : '${s.usuarioId}@${s.copropiedadId ?? ''}';
  }

  bool get _enLaApp => _autenticado && _primerIngresoHecho;

  @override
  void didChangeAppLifecycleState(AppLifecycleState estado) {
    if (!_enLaApp) return;
    if (estado == AppLifecycleState.resumed) {
      unawaited(alVolverAPrimerPlano());
    } else if (estado == AppLifecycleState.paused || estado == AppLifecycleState.hidden) {
      _sincronia.alPasarASegundoPlano();
    }
  }

  /// Público para que la prueba de widget lo ejerza sin simular el sistema
  /// operativo: lo que hay que demostrar es el ORDEN —renovar y luego pedir—, y
  /// eso se prueba llamando a esto con un autenticador que cuenta llamadas.
  Future<void> alVolverAPrimerPlano() => _sincronia.alVolverAPrimerPlano();

  /// La dirección cambió: el caso de uso ya cerró la sesión, y aquí se olvida
  /// lo que se veía del servidor anterior y se vuelve al acceso.
  void _alCambiarServidor() {
    if (mounted) _cerrarSesion();
  }

  void _cargarTodo() {
    for (final c in _c.todos) {
      unawaited(c.cargarAhora());
    }
    // El token de FCM rota solo. Sin Firebase en esta compilación no hay
    // token y esto no registra nada; queda conectado para cuando lo haya.
    unawaited(_avisos.asegurarRegistro());
    _sincronia.ciclo.reanudar();
    // Lo que quedó sin enviar se intenta ahora.
    unawaited(_visitas.vaciarBandeja(context));
  }

  void _volverAlPrimero() {
    if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
  }

  void _cerrarSesion() {
    // Olvidar ANTES de cerrar: si se cerrara primero y la app se redibujara con
    // los controladores llenos, los datos del residente anterior seguirían en
    // pantalla un instante. En un teléfono compartido eso es una fuga.
    _sincronia.alPasarASegundoPlano();
    for (final c in _c.todos) {
      c.olvidar();
    }
    // El token pertenece al aparato; el REGISTRO pertenece a la cuenta.
    _avisos.olvidar();
    unawaited(_sesion.cerrar());
    _volverAlPrimero();
    setState(() {
      _autenticado = false;
      _primerIngresoHecho = false;
      _pestana = 0;
    });
  }

  void _pedirAcceso() {
    _sincronia.alPasarASegundoPlano();
    if (!mounted) return;
    _volverAlPrimero();
    setState(() => _autenticado = false);
  }

  /// Una escritura que se encuentra la sesión muerta lleva a la pantalla de
  /// acceso en vez de dejar al residente frente a un formulario que ya no
  /// puede enviar. El fallo se relanza igual: la pantalla decide qué decir.
  Future<T> _conSesion<T>(Future<T> Function() operacion) async {
    try {
      return await operacion();
    } on Fallo catch (f) {
      if (f.clase == ClaseDeFallo.sesionInvalida && mounted) _pedirAcceso();
      rethrow;
    }
  }

  Future<void> _abrir(Widget pantalla, List<ControladorDeVista<Object?>> visibles) =>
      _sincronia.conEncima(
        visibles,
        () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => pantalla)),
      );

  Future<void> _abrirNotificaciones() async {
    _sinVer.abierta = true;
    await _abrir(
      PantallaDeNotificaciones(
        controlador: _c.notificaciones,
        alPedirAcceso: _pedirAcceso,
        alRecargar: _sincronia.ciclo.ahora,
      ),
      [_c.notificaciones],
    );
    _sinVer.abierta = false;
  }

  @override
  Widget build(BuildContext context) {
    if (!_autenticado) {
      return PantallaDeAcceso(
        ambiente: _d.ambiente,
        sesion: _sesion,
        alEntrar: () => setState(() {
          _autenticado = true;
          _recuperada = false;
          _primerIngresoHecho = false;
        }),
      );
    }

    if (!_primerIngresoHecho) {
      return PuertaDePrimerIngreso(
        sesion: _sesion,
        alta: _d.alta,
        cuenta: _d.cuenta,
        recuperada: _recuperada,
        alSalir: _cerrarSesion,
        alTerminar: () {
          setState(() => _primerIngresoHecho = true);
          _cargarTodo();
        },
      );
    }

    return PestanasDelArmazon(
      pestana: _pestana,
      alElegir: (i) {
        setState(() => _pestana = i);
        // La pestaña que aparece se pone al día en el acto.
        unawaited(_sincronia.ciclo.ahora());
      },
      controladores: _c,
      sinVer: _sinVer,
      pendientes: _envio.bandeja.pendientes,
      llamador: _d.llamador,
      alRecargar: _sincronia.ciclo.ahora,
      alPedirAcceso: _pedirAcceso,
      alCerrarSesion: _cerrarSesion,
      alRegistrarVisita: () =>
          _sincronia.conEncima(const [], () => _visitas.crearVisitante(context)),
      alVolverAAutorizar: (v) =>
          _sincronia.conEncima(const [], () => _visitas.volverAAutorizar(context, v)),
      alReintentarPendientes: () => _visitas.vaciarBandeja(context),
      alAbrirFamilia: () => _abrir(
        PantallaDeFamilia(controlador: _c.familia, alPedirAcceso: _pedirAcceso),
        [_c.familia],
      ),
      alAbrirHistorial: () => _abrir(
        PantallaDeHistorial(controlador: _c.historial, alPedirAcceso: _pedirAcceso),
        [_c.historial],
      ),
      alAbrirNotificaciones: _abrirNotificaciones,
      acciones: _acciones,
    );
  }
}
