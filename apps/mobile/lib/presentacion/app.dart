/// El armazón de la app: navegación, sesión y el ciclo de vida.
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
///   2. Recarga lo que hay en pantalla, si renovó o si el dato ya es viejo.
///
/// El orden no es negociable: recargar primero enviaría la petición con el
/// token vencido, que es el 401 que se quiere evitar. Y el segundo paso existe
/// porque una sesión renovada sin recargar deja al residente mirando datos de
/// hace horas con una sesión nueva — técnicamente correcto, inútil.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LA NAVEGACIÓN ES LA DEL MOCKUP, INCLUIDAS LAS DOS PESTAÑAS QUE AÚN NO SON
///
/// `03-mockups.md` §3 fija cinco pestañas —Inicio · Visitantes · Vehículos ·
/// Zonas · Perfil— y deja Mi Familia, Historial y Notificaciones fuera de la
/// barra, alcanzables desde Inicio y Perfil. Se respeta.
///
/// Visitantes (M-4) y Zonas (M-5) son de 11-B. **No se esconden**: la pestaña
/// está y explica qué falta, como la consola de guardia virtual explica que el
/// puente de vídeo llega en la 15 en vez de mostrar un recuadro negro. Quitar
/// las pestañas dejaría una barra de tres que habría que rehacer, y al
/// residente sin saber que lo que busca existe y aún no está.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../aplicacion/avisos_en_uso.dart';
import '../aplicacion/envio_de_visitas.dart';
import '../aplicacion/sesion_en_uso.dart';
import '../configuracion/ambiente.dart';
import '../infraestructura/camara/fuente_de_fotos.dart';
import '../configuracion/tema.dart';
import '../dominio/entidades.dart';
import '../dominio/hogar.dart';
import '../dominio/puertos.dart';
import 'acciones_del_hogar.dart';
import 'controlador.dart';
import 'pantallas/acceso.dart';
import 'pantallas/familia.dart';
import 'pantallas/historial.dart';
import 'pantallas/inicio.dart';
import 'pantallas/notificaciones.dart';
import 'pantallas/nuevo_visitante.dart';
import 'pantallas/perfil.dart';
import 'pantallas/primer_ingreso.dart';
import 'pantallas/vehiculos.dart';
import 'pantallas/visitantes.dart';
import 'pantallas/volver_a_autorizar.dart';
import 'pantallas/zonas.dart';

/// Todo lo que la app necesita, construido una vez en `main`.
class Dependencias {
  const Dependencias({
    required this.ambiente,
    required this.sesion,
    required this.repositorio,
    required this.reloj,
    required this.notificaciones,
    required this.claves,
    required this.alta,
    required this.hogar,
    required this.cuenta,
    required this.llamador,
    this.tomarFoto,
  });

  final Ambiente ambiente;
  final SesionEnUso sesion;
  final RepositorioDelResidente repositorio;
  final Reloj reloj;
  final FuenteDeNotificaciones notificaciones;

  /// ETAPA 15-I · el primer ingreso, el hogar, la contraseña y el puerto que
  /// toca el marcador del sistema operativo.
  final RepositorioDeAlta alta;
  final RepositorioDelHogar hogar;
  final ServicioDeCuenta cuenta;
  final LlamadorDeTelefono llamador;

  /// 15-I (hito 3) · la cámara REAL del teléfono. `null` = la simulada (web,
  /// recorrido y pruebas), declarada como tal en `fuente_de_fotos.dart`.
  final TomarFoto? tomarFoto;

  /// De dónde sale la clave de idempotencia de cada visita. Se inyecta porque
  /// una clave que la pantalla fabricara al construirse cambiaría con cada
  /// `setState`, y entonces dejaría de ser una clave de idempotencia. Y porque
  /// una prueba necesita poder fijarla.
  final String Function() claves;
}

class AppDelResidente extends StatelessWidget {
  const AppDelResidente({super.key, required this.dependencias});
  final Dependencias dependencias;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Next Control Residencial',
      debugShowCheckedModeBanner: false,
      theme: temaClaro(),
      darkTheme: temaOscuro(),
      home: Armazon(dependencias: dependencias),
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
  late final ControladorDeVista _inicio = controladorDeInicio(_repo);
  late final ControladorDeVista<List<MiembroDeFamilia>> _familia = controladorDeFamilia(_repo);
  late final ControladorDeVista<List<Vehiculo>> _vehiculos = controladorDeVehiculos(_repo);
  late final ControladorDeVista<PerfilDelResidente> _perfil =
      ControladorDeVista<PerfilDelResidente>(leer: widget.dependencias.hogar.miPerfil);
  late final ControladorDeVista<MisOcupantes> _ocupantes = ControladorDeVista<MisOcupantes>(
    leer: widget.dependencias.alta.misOcupantes,
  );
  late final AccionesDelHogar _acciones = AccionesDelHogar(
    sesion: _sesion,
    alta: widget.dependencias.alta,
    hogar: widget.dependencias.hogar,
    cuenta: widget.dependencias.cuenta,
    familia: _familia,
    vehiculos: _vehiculos,
    perfil: _perfil,
    alCambiarDeVivienda: _cargarTodo,
  );
  late final ControladorDeVista<List<Autorizacion>> _autorizaciones = controladorDeAutorizaciones(
    _repo,
  );
  late final ControladorDeVista<List<VisitanteReciente>> _ultimos =
      controladorDeUltimosVisitantes(_repo);
  late final ControladorDeHistorial _historial = ControladorDeHistorial(_repo);
  late final ControladorDeVista<List<ZonaComun>> _zonas = controladorDeZonas(_repo);
  late final ControladorDeAvisos _avisos = ControladorDeAvisos(
    fuente: widget.dependencias.notificaciones,
    repositorio: _repo,
    reloj: widget.dependencias.reloj,
  );
  late final EnvioDeVisitas _envio = EnvioDeVisitas(
    repositorio: _repo,
    reloj: widget.dependencias.reloj,
  );

  RepositorioDelResidente get _repo => widget.dependencias.repositorio;
  SesionEnUso get _sesion => widget.dependencias.sesion;

  int _pestana = 0;
  bool _autenticado = false;

  /// 3.2 · hasta que la puerta del primer ingreso diga «listo», no se ve ni se
  /// carga ninguna otra pantalla.
  bool _primerIngresoHecho = false;

  /// La sesión vino del llavero al arrancar (S-59), no de un acceso de ahora.
  bool _recuperada = false;
  DateTime? _ultimaCarga;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // El estado de los avisos se pinta en Perfil como valor, no como widget con
    // su propio `AnimatedBuilder`: así la tarjeta de Perfil no tiene que saber
    // que existe un controlador detrás.
    _avisos.addListener(_alCambiarAvisos);
    _autenticado = _sesion.haySesion;
    _recuperada = _autenticado;
  }

  @override
  void dispose() {
    _avisos.removeListener(_alCambiarAvisos);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _alCambiarAvisos() {
    if (mounted) setState(() {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState estado) {
    if (estado != AppLifecycleState.resumed || !_autenticado || !_primerIngresoHecho) return;
    alVolverAPrimerPlano();
  }

  /// Público para que la prueba de widget lo ejerza sin simular el sistema
  /// operativo: lo que hay que demostrar es el ORDEN —renovar y luego pedir—, y
  /// eso se prueba llamando a esto con un autenticador que cuenta llamadas.
  Future<void> alVolverAPrimerPlano() async {
    final renovo = await _sesion.alVolverAPrimerPlano();
    if (!mounted) return;
    if (!_sesion.haySesion) {
      // El refresco falló: la sesión está muerta y se pide acceso, en vez de
      // dejar en pantalla datos que ya no se pueden recargar.
      setState(() => _autenticado = false);
      return;
    }
    final viejo =
        _ultimaCarga == null ||
        widget.dependencias.reloj.ahora().difference(_ultimaCarga!) > const Duration(minutes: 2);
    if (renovo || viejo) _cargarTodo();
  }

  void _cargarTodo() {
    _ultimaCarga = widget.dependencias.reloj.ahora();
    _inicio.cargarAhora();
    _familia.cargarAhora();
    _vehiculos.cargarAhora();
    _autorizaciones.cargarAhora();
    _ultimos.cargarAhora();
    _historial.cargarAhora();
    _zonas.cargarAhora();
    _perfil.cargarAhora();
    _ocupantes.cargarAhora();
    // El token de FCM rota solo. Si el registro solo ocurriera al entrar en la
    // pantalla de notificaciones, dejaría de funcionar en silencio el día que
    // rote y nadie se enteraría hasta que un visitante esperara en la portería.
    unawaited(_avisos.asegurarRegistro());
    // Y lo que quedó sin enviar se intenta ahora, que es cuando más probable es
    // que haya red: acaba de volver la app a primer plano.
    unawaited(_vaciarBandeja());
  }

  Future<void> _vaciarBandeja() async {
    try {
      final aceptados = await _envio.vaciar();
      if (!mounted) return;
      setState(() {});
      if (aceptados > 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              aceptados == 1
                  ? 'Se envió 1 visita que estaba pendiente.'
                  : 'Se enviaron $aceptados visitas que estaban pendientes.',
            ),
          ),
        );
        _recargarVisitas();
      }
    } on Fallo {
      // La sesión murió a mitad del vaciado. Lo resuelve el refresco de primer
      // plano; aquí lo que no puede pasar es que reviente el armazón entero.
      if (mounted) setState(() {});
    }
  }

  void _cerrarSesion() {
    // Olvidar ANTES de cerrar: si se cerrara primero y la app se redibujara con
    // los controladores llenos, los datos del residente anterior seguirían en
    // pantalla un instante. En un teléfono compartido eso es una fuga.
    for (final c in <ControladorDeVista<Object?>>[
      _inicio,
      _familia,
      _vehiculos,
      _autorizaciones,
      _ultimos,
      _historial,
      _zonas,
      _perfil,
      _ocupantes,
    ]) {
      c.olvidar();
    }
    // El token pertenece al aparato; el REGISTRO pertenece a la cuenta. Sin
    // esto, la siguiente cuenta en el mismo teléfono no volvería a registrarse
    // y creería que le avisarán.
    _avisos.olvidar();
    _sesion.cerrar();
    setState(() {
      _autenticado = false;
      _primerIngresoHecho = false;
      _pestana = 0;
    });
  }

  void _pedirAcceso() => setState(() => _autenticado = false);

  /// Lo que cambia al crear o repetir una visita: la lista de lo autorizado y
  /// la de los últimos visitantes.
  void _recargarVisitas() {
    _autorizaciones.cargarAhora();
    _ultimos.cargarAhora();
  }

  /// La cámara real si la hay; si no, la simulada y declarada como tal.
  TomarFoto get _tomarFoto => widget.dependencias.tomarFoto ?? CamaraSimulada().tomar;

  /// Abre M-4. **La clave se genera aquí, al abrir el formulario**, y no dentro
  /// de la pantalla: si la fabricara el widget, cada reconstrucción la
  /// cambiaría y un reintento crearía una visita distinta en vez de recuperar
  /// la anterior (RN-17).
  Future<void> _crearVisitante() async {
    final clave = widget.dependencias.claves();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PantallaDeNuevoVisitante(
          enviar: _enviarVisita,
          tomarFoto: _tomarFoto,
          claveDeIdempotencia: clave,
          ahora: widget.dependencias.reloj.ahora(),
        ),
      ),
    );
    if (!mounted) return;
    // Al volver se recarga aunque se haya encolado: la bandeja también cambió.
    setState(() {});
    _recargarVisitas();
  }

  /// F6 · abre «Volver a autorizar» con su PROPIA clave, generada al abrir por
  /// la misma razón que la del formulario nuevo.
  Future<void> _volverAAutorizar(VisitanteReciente visitante) async {
    final clave = widget.dependencias.claves();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PantallaDeVolverAAutorizar(
          visitante: visitante,
          claveDeIdempotencia: clave,
          ahora: widget.dependencias.reloj.ahora(),
          volverAAutorizar: ({
            required autorizacionId,
            required inicio,
            required duracionMinutos,
            required casillaMarcada,
            required claveDeIdempotencia,
          }) =>
              _conSesion(
                () => _repo.volverAAutorizar(
                  autorizacionId: autorizacionId,
                  inicio: inicio,
                  duracionMinutos: duracionMinutos,
                  casillaMarcada: casillaMarcada,
                  claveDeIdempotencia: claveDeIdempotencia,
                ),
              ),
        ),
      ),
    );
    if (!mounted) return;
    _recargarVisitas();
  }

  /// El puente entre la pantalla y la bandeja. Traduce el desenlace del envío al
  /// vocabulario de la pantalla, que no conoce la bandeja ni el repositorio.
  Future<ResultadoDeEnvio> _enviarVisita(NuevaVisita visita) => _conSesion(() async {
        final desenlace = await _envio.enviar(visita);
        return switch (desenlace) {
          Aceptado(resultado: final r) => EnvioResuelto(r),
          Rechazado(resultado: final r) => EnvioResuelto(r),
          Pendiente() => const EnvioEncolado(),
        };
      });

  /// Una escritura que se encuentra la sesión muerta lleva a la pantalla de
  /// acceso en vez de dejar al residente frente a un formulario que ya no
  /// puede enviar. El fallo se relanza igual: la pantalla decide qué decir.
  Future<T> _conSesion<T>(Future<T> Function() operacion) async {
    try {
      return await operacion();
    } on Fallo catch (f) {
      if (f.clase == ClaseDeFallo.sesionInvalida && mounted) {
        _pedirAcceso();
        Navigator.of(context).popUntil((r) => r.isFirst);
      }
      rethrow;
    }
  }

  void _abrirNotificaciones() {
    _abrir(
      AnimatedBuilder(
        animation: _avisos,
        builder: (_, _) => PantallaDeNotificaciones(
          estado: _avisos.estado,
          alActivar: _avisos.activar,
          alReintentar: _avisos.reintentar,
          ultimoRegistro: _avisos.ultimoRegistro,
          detalleDelFallo: _avisos.detalleDelFallo,
        ),
      ),
    );
  }

  void _abrir(Widget pantalla) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => pantalla));
  }

  @override
  Widget build(BuildContext context) {
    if (!_autenticado) {
      return PantallaDeAcceso(
        ambiente: widget.dependencias.ambiente,
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
        alta: widget.dependencias.alta,
        cuenta: widget.dependencias.cuenta,
        recuperada: _recuperada,
        alSalir: _cerrarSesion,
        alTerminar: () {
          setState(() => _primerIngresoHecho = true);
          _cargarTodo();
        },
      );
    }

    final pantallas = <Widget>[
      PantallaDeInicio(
        controlador: _inicio,
        autorizaciones: _autorizaciones,
        alPedirAcceso: _pedirAcceso,
        alRegistrarVisita: _crearVisitante,
        alAbrirFamilia: () =>
            _abrir(PantallaDeFamilia(controlador: _familia, alPedirAcceso: _pedirAcceso)),
        alAbrirHistorial: () =>
            _abrir(PantallaDeHistorial(controlador: _historial, alPedirAcceso: _pedirAcceso)),
        alAbrirVehiculos: () => setState(() => _pestana = 2),
      ),
      PantallaDeVisitantes(
        controlador: _autorizaciones,
        ultimos: _ultimos,
        alPedirAcceso: _pedirAcceso,
        alCrear: _crearVisitante,
        alVolverAAutorizar: _volverAAutorizar,
        pendientes: _envio.bandeja.pendientes,
        alReintentarPendientes: _vaciarBandeja,
        ahora: widget.dependencias.reloj.ahora(),
      ),
      PantallaDeVehiculos(
        controlador: _vehiculos,
        alPedirAcceso: _pedirAcceso,
        alRegistrar: () => _acciones.registrarVehiculo(context),
        alDesactivar: (v) => _acciones.desactivarVehiculo(context, v),
      ),
      PantallaDeZonas(controlador: _zonas, alPedirAcceso: _pedirAcceso),
      PantallaDePerfil(
        controladorDeInicio: _inicio,
        controladorDePerfil: _perfil,
        controladorDeOcupantes: _ocupantes,
        llamador: widget.dependencias.llamador,
        alCerrarSesion: _cerrarSesion,
        alAbrirFamilia: () =>
            _abrir(PantallaDeFamilia(controlador: _familia, alPedirAcceso: _pedirAcceso)),
        alAbrirHistorial: () =>
            _abrir(PantallaDeHistorial(controlador: _historial, alPedirAcceso: _pedirAcceso)),
        alAbrirVehiculos: () => setState(() => _pestana = 2),
        alAbrirNotificaciones: _abrirNotificaciones,
        alEditarPerfil: (p) => _acciones.editarPerfil(context, p),
        alCambiarVivienda: (p) => _acciones.cambiarVivienda(context, p),
        alCambiarContrasena: () => _acciones.cambiarContrasena(context),
        estadoDeAvisos: _avisos.estado,
      ),
    ];

    return Scaffold(
      body: SafeArea(child: pantallas[_pestana]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _pestana,
        onDestinationSelected: (i) => setState(() => _pestana = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Inicio'),
          NavigationDestination(icon: Icon(Icons.person_add_alt_outlined), label: 'Visitantes'),
          NavigationDestination(icon: Icon(Icons.directions_car_outlined), label: 'Vehículos'),
          NavigationDestination(icon: Icon(Icons.pool_outlined), label: 'Zonas'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: 'Perfil'),
        ],
      ),
    );
  }
}
