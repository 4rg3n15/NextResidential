import 'package:ncr_residente/aplicacion/servidor_en_uso.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/configuracion/ambiente.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/almacen/almacen_de_texto.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';
import 'package:ncr_residente/presentacion/app.dart';

import 'hogar_falso.dart';
import 'sincronizacion.dart';
import 'visitas.dart';

/// La app entera sobre dobles de PUERTOS (15-L), para las pruebas de
/// sincronización, de servidor y de bandeja: lo que se ejerce es el armazón
/// —el ciclo, el ciclo de vida, la navegación— con un servidor que la prueba
/// gobierna como lo gobernaría portería desde la consola.

/// El reloj del NEGOCIO (sesión, bandeja). El del ciclo es el de la prueba
/// de widget (`pump(Duration)`); éste se mueve a mano cuando la prueba necesita
/// que venza un reintento de la bandeja.
class RelojMovible implements Reloj {
  RelojMovible(this._ahora);
  DateTime _ahora;
  void avanzar(Duration d) => _ahora = _ahora.add(d);
  @override
  DateTime ahora() => _ahora;
}

final ahoraDePrueba = DateTime.utc(2026, 9, 20, 12);

/// Ver `tema_test.dart`: la llave se compone para no dejar su forma escrita.
const _prefijoPublicable = 'sb_publishable';

class AutenticadorGobernado implements Autenticador {
  AutenticadorGobernado(this._reloj);
  final Reloj _reloj;

  /// Si no es `null`, el acceso falla con esto (sin red, por ejemplo).
  Fallo? falloAlEntrar;
  int renovaciones = 0;

  Sesion _emitir() => Sesion(
        tokenDeAcceso: 'acceso',
        tokenDeRefresco: 'refresco',
        expiraEn: _reloj.ahora().add(const Duration(minutes: 5)),
        usuarioId: 'usr-1',
        copropiedadId: 'cop-1',
        correo: 'residente@ejemplo.invalid',
      );

  @override
  Future<Sesion> iniciarSesion(IdentificadorDeAcceso i, {required String clave}) async {
    final f = falloAlEntrar;
    if (f != null) throw f;
    return _emitir();
  }

  @override
  Future<Sesion> renovar(Sesion sesion) async {
    renovaciones += 1;
    return _emitir();
  }
}

Autorizacion visitaDelConjunto(
  String id,
  String visitante,
  SituacionDeVisita situacion, {
  String? motivo,
}) =>
    Autorizacion(
      id: id,
      visitante: visitante,
      tipo: 'unica',
      desde: ahoraDePrueba.subtract(const Duration(hours: 1)),
      hasta: ahoraDePrueba.add(const Duration(hours: 3)),
      placa: null,
      permiteAccesoVehicular: false,
      estado: situacion == SituacionDeVisita.rechazada ? 'revocada' : 'activa',
      acompanantes: 0,
      situacion: situacion,
      motivoRechazo: motivo,
    );

/// El servidor del residente, gobernado por la prueba. Cuenta las lecturas
/// por operación y las creaciones por clave, y deduplica por clave como el
/// servidor de verdad.
class ResidenteGobernado implements RepositorioDelResidente {
  List<Autorizacion> autorizaciones = [];
  List<ZonaComun> zonas = [];

  /// Si no es `null`, TODA lectura falla con esto.
  Fallo? falla;

  /// Sin red, crear una visita falla por transporte.
  bool hayRed = true;

  /// El servidor crea la visita y la respuesta se pierde por el camino.
  bool perderLaRespuesta = false;
  final Map<String, int> lecturas = {};
  final Map<String, int> llamadasPorClave = {};
  final Map<String, String> creadas = {};

  int leidas(String que) => lecturas[que] ?? 0;

  Future<T> _leer<T>(String que, T valor) async {
    lecturas[que] = leidas(que) + 1;
    final f = falla;
    if (f != null) throw f;
    return valor;
  }

  @override
  Future<MiHogar> miHogar() => _leer(
        'hogar',
        const MiHogar(
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
        ),
      );

  @override
  Future<List<Autorizacion>> misAutorizaciones() =>
      _leer('autorizaciones', List<Autorizacion>.of(autorizaciones));

  @override
  Future<List<VisitanteReciente>> ultimosVisitantes() => _leer('ultimos', const []);
  @override
  Future<List<MiembroDeFamilia>> miFamilia() => _leer('familia', const []);
  @override
  Future<List<Vehiculo>> misVehiculos() => _leer('vehiculos', const []);
  @override
  Future<List<EventoDeAcceso>> miHistorial(PeriodoDeHistorial p) => _leer('historial', const []);
  @override
  Future<List<ZonaComun>> misZonas() => _leer('zonas', List<ZonaComun>.of(zonas));

  @override
  Future<ResultadoDeVisita> crearVisita(NuevaVisita visita) async {
    if (!hayRed) throw const Fallo(ClaseDeFallo.sinConexion, 'Sin red');
    final clave = visita.claveDeIdempotencia;
    llamadasPorClave[clave] = (llamadasPorClave[clave] ?? 0) + 1;
    final repetida = creadas.containsKey(clave);
    final id = creadas.putIfAbsent(clave, () => 'aut-${creadas.length + 1}');
    if (!repetida) {
      autorizaciones = [
        ...autorizaciones,
        visitaDelConjunto(id, visita.visitante, SituacionDeVisita.vigente),
      ];
    }
    if (perderLaRespuesta) {
      perderLaRespuesta = false;
      throw const Fallo(ClaseDeFallo.sinConexion, 'Se cortó la respuesta');
    }
    return VisitaCreada(id: id, repetida: repetida);
  }

  @override
  Future<ResultadoDeVisita> volverAAutorizar({
    required String autorizacionId,
    required DateTime inicio,
    required int duracionMinutos,
    required bool casillaMarcada,
    required String claveDeIdempotencia,
  }) async =>
      const VisitaCreada(id: 'rep', repetida: false);

  @override
  Future<void> registrarAparato(AparatoDeNotificaciones aparato) async {}
}

/// Todo lo que la app de prueba comparte entre «arranques»: si la prueba
/// vuelve a construir la app con el MISMO `Mundo`, es cerrar y volver a abrir.
class Mundo {
  Mundo({this.compilada = 'http://mac-de-argenis.local:3000'})
      : reloj = RelojMovible(ahoraDePrueba),
        repo = ResidenteGobernado(),
        notificaciones = NotificacionesFalsas(),
        comprobador = ComprobadorFijo(),
        alta = AltaFalsa(),
        llavero = AlmacenDeTextoEnMemoria(),
        llaveroDeSesion = AlmacenEnMemoria() {
    autenticador = AutenticadorGobernado(reloj);
  }

  final String compilada;
  final RelojMovible reloj;
  final AltaFalsa alta;
  late final AutenticadorGobernado autenticador;
  final ResidenteGobernado repo;
  final NotificacionesFalsas notificaciones;
  final ComprobadorFijo comprobador;
  final AlmacenDeTextoEnMemoria llavero;
  final AlmacenEnMemoria llaveroDeSesion;

  /// Lo que haría `main`: leer la dirección guardada y la sesión, y armar la
  /// app. Devuelve la sesión y la dirección para que la prueba las mire.
  Future<(AppDelResidente, SesionEnUso, DireccionDelServidor)> arrancar({
    bool conSesion = true,
  }) async {
    final sesion = SesionEnUso(almacen: llaveroDeSesion, autenticador: autenticador, reloj: reloj);
    await sesion.recuperar();
    if (conSesion && !sesion.haySesion) {
      await sesion.iniciar(identificador: PorCorreo('x@y.invalid'), clave: 'z');
    }
    final direccion = DireccionDelServidor(compilada: compilada, almacen: llavero);
    await direccion.recuperar();
    final app = AppDelResidente(
      dependencias: Dependencias(
        ambiente: Ambiente(
          apiUrl: compilada,
          supabaseUrl: 'http://supabase.invalid',
          supabaseClavePublicable: '${_prefijoPublicable}_de_prueba',
        ),
        sesion: sesion,
        repositorio: repo,
        reloj: reloj,
        notificaciones: _SinToken(),
        claves: () => 'clave-de-prueba',
        alta: alta,
        hogar: HogarFalso(),
        cuenta: CuentaFalsa(),
        llamador: LlamadorFalso(),
        servidor: CambioDeServidor(direccion: direccion, comprobador: comprobador, sesion: sesion),
        notificacionesDelConjunto: notificaciones,
        tomarFoto: () async => fotoTomada(medidasBuenas),
        almacen: llavero,
      ),
    );
    return (app, sesion, direccion);
  }
}

class _SinToken implements FuenteDeNotificaciones {
  @override
  Future<bool> pedirPermiso() async => true;
  @override
  Future<AparatoDeNotificaciones?> aparato() async => null;
}
