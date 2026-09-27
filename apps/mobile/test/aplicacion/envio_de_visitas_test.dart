import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/envio_de_visitas.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';

import '../dobles/visitas.dart';

/// Reloj que avanza a mano: la política de reintento es exponencial y una
/// prueba que esperase de verdad tardaría minutos en ejercerla.
class RelojMovible implements Reloj {
  RelojMovible(this._ahora);
  DateTime _ahora;
  @override
  DateTime ahora() => _ahora;
  void avanzar(Duration d) => _ahora = _ahora.add(d);
}

class RepoDeEnvio implements RepositorioDelResidente {
  RepoDeEnvio();

  /// La cola de respuestas, en orden. Una lista y no un valor fijo porque lo
  /// que hay que probar es la SECUENCIA: falla, vuelve la red, acepta.
  final List<Object> respuestas = [];
  final List<NuevaVisita> recibidas = [];

  @override
  Future<ResultadoDeVisita> crearVisita(NuevaVisita visita) async {
    recibidas.add(visita);
    final r = respuestas.isEmpty ? const VisitaCreada(id: 'a', repetida: false) : respuestas.removeAt(0);
    if (r is Fallo) throw r;
    return r as ResultadoDeVisita;
  }

  @override
  Future<List<ZonaComun>> misZonas() async => const [];
  @override
  Future<List<VisitanteReciente>> ultimosVisitantes() => throw UnimplementedError();
  @override
  Future<ResultadoDeVisita> volverAAutorizar({
    required String autorizacionId,
    required DateTime inicio,
    required int duracionMinutos,
    required bool casillaMarcada,
    required String claveDeIdempotencia,
  }) =>
      throw UnimplementedError();

  @override
  Future<void> registrarAparato(AparatoDeNotificaciones a) async {}
  @override
  Future<MiHogar> miHogar() => throw UnimplementedError();
  @override
  Future<List<MiembroDeFamilia>> miFamilia() => throw UnimplementedError();
  @override
  Future<List<Vehiculo>> misVehiculos() => throw UnimplementedError();
  @override
  Future<List<Autorizacion>> misAutorizaciones() => throw UnimplementedError();
  @override
  Future<List<EventoDeAcceso>> miHistorial(PeriodoDeHistorial p) => throw UnimplementedError();
}

NuevaVisita visita(String clave) => visitaDePrueba(clave);

void main() {
  late RelojMovible reloj;
  late RepoDeEnvio repo;
  late EnvioDeVisitas envio;

  setUp(() {
    reloj = RelojMovible(DateTime.utc(2026, 9, 20, 12));
    repo = RepoDeEnvio();
    envio = EnvioDeVisitas(repositorio: repo, reloj: reloj);
  });

  test('con red, se acepta y NO queda nada en la bandeja', () async {
    final r = await envio.enviar(visita('k1'));
    expect(r, isA<Aceptado>());
    expect(envio.bandeja.pendientes, isEmpty);
  });

  test('sin red, se encola y lo dice', () async {
    repo.respuestas.add(const Fallo(ClaseDeFallo.sinConexion, 'sin red'));
    final r = await envio.enviar(visita('k1'));
    expect(r, isA<Pendiente>());
    expect(envio.bandeja.pendientes.single.claveDeIdempotencia, 'k1');
    expect(envio.bandeja.pendientes.single.recurso, 'mi/visitas');
  });

  test('EL PUNTO DE TODO ESTO · el reintento repite la MISMA clave (RN-17)', () async {
    // Sin esto, la bandeja sería una fábrica de duplicados: cada reintento
    // crearía una visita distinta y el residente tendría cuatro visitantes
    // donde autorizó uno.
    repo.respuestas.add(const Fallo(ClaseDeFallo.sinConexion, 'sin red'));
    await envio.enviar(visita('k1'));

    reloj.avanzar(const Duration(minutes: 5));
    final aceptados = await envio.vaciar();

    expect(aceptados, 1);
    expect(repo.recibidas.map((v) => v.claveDeIdempotencia), ['k1', 'k1']);
    expect(envio.bandeja.pendientes, isEmpty);
  });

  test('un rechazo de negocio NO se reintenta: sale de la bandeja con su motivo', () async {
    repo.respuestas.add(
      const VisitaRechazada(motivo: MotivoDeRechazo.listaNegra, explicacion: 'No se puede.'),
    );
    final r = await envio.enviar(visita('k1'));

    expect(r, isA<Rechazado>());
    expect(((r as Rechazado).resultado as VisitaRechazada).motivo, MotivoDeRechazo.listaNegra);
    // Insistir ocho veces no la va a sacar de la lista negra.
    expect(envio.bandeja.pendientes, isEmpty);
    expect(envio.rechazos['k1'], isNotNull);
  });

  test('UNA FOTO QUE EL SERVIDOR NO ACEPTÓ tampoco se reintenta', () async {
    // La misma foto seguirá borrosa en el octavo intento. Sale de la bandeja
    // y se le enseña al residente, que es quien puede repetirla.
    repo.respuestas.add(const FotoRechazada(['NITIDEZ']));
    final r = await envio.enviar(visita('k1'));

    expect(r, isA<Rechazado>());
    expect((r as Rechazado).resultado, isA<FotoRechazada>());
    expect(envio.bandeja.pendientes, isEmpty);
    expect(repo.recibidas, hasLength(1), reason: 'un solo intento');
    expect(envio.rechazos['k1'], isA<FotoRechazada>());
  });

  test('un formulario que el servidor no admite (422) se dice y no se encola', () async {
    repo.respuestas.add(
      const Fallo(ClaseDeFallo.datosNoValidos, 'Falta confirmar que el visitante autorizó'),
    );
    await expectLater(
      envio.enviar(visita('k1')),
      throwsA(isA<Fallo>().having((f) => f.clase, 'clase', ClaseDeFallo.datosNoValidos)),
    );
    expect(envio.bandeja.pendientes, isEmpty, reason: 'reintentarlo daría lo mismo');
  });

  test('un 401 se relanza y no se queda retrocediendo en la bandeja', () async {
    repo.respuestas.add(const Fallo(ClaseDeFallo.sesionInvalida, 'token vencido'));
    await expectLater(envio.enviar(visita('k1')), throwsA(isA<Fallo>()));
    expect(envio.bandeja.pendientes, isEmpty);
  });

  test('antes de su próximo intento, vaciar no toca la red', () async {
    repo.respuestas.add(const Fallo(ClaseDeFallo.sinConexion, 'sin red'));
    await envio.enviar(visita('k1'));
    final intentosPrevios = repo.recibidas.length;

    // El reloj no se mueve: el retroceso exponencial todavía no ha vencido.
    expect(await envio.vaciar(), 0);
    expect(repo.recibidas.length, intentosPrevios);
  });

  test('un envío ilegible se descarta sin llevarse por delante el resto', () async {
    // Una versión anterior de la app, o un guardado a medias. Si reventara el
    // vaciado, el residente no volvería a enviar nada nunca más.
    repo.respuestas.add(const Fallo(ClaseDeFallo.sinConexion, 'sin red'));
    await envio.enviar(visita('buena'));
    expect(visitaDe(const {'visitante': 'sin fechas'}), isNull);
  });

  test('el cuerpo de la versión ANTERIOR de la app (sin foto ni casilla) no se lee', () {
    // Leerlo enviaría una visita sin foto y sin casilla: algo que el residente
    // de hoy no compuso y que el servidor rechazaría igual.
    expect(
      visitaDe(const {
        'visitante': 'Plomero',
        'documento': '1020304050',
        'desde': '2026-09-20T14:00:00.000Z',
        'hasta': '2026-09-20T18:00:00.000Z',
        'acompanantes': <String>[],
        'claveDeIdempotencia': 'k-vieja',
      }),
      isNull,
    );
  });

  test('cada campo roto invalida el cuerpo entero, no sólo los primeros', () {
    final bueno = cuerpoDe(visita('k1'));
    expect(visitaDe(bueno), isNotNull, reason: 'el de control sí se lee');
    Map<String, Object?> sin(String campo) => {...bueno}..remove(campo);
    Map<String, Object?> con(String campo, Object? valor) => {...bueno, campo: valor};
    Map<String, Object?> conMedida(String medida, Object? valor) {
      final foto = Map<String, Object?>.from(bueno['foto']! as Map);
      final medidas = Map<String, Object?>.from(foto['medidas']! as Map)..[medida] = valor;
      return {...bueno, 'foto': {...foto, 'medidas': medidas}};
    }

    for (final (nombre, cuerpo) in [
      ('sin casilla', sin('casillaMarcada')),
      ('sin foto', sin('foto')),
      ('sin documento', sin('documento')),
      ('inicio que no es fecha', con('inicio', 'mañana')),
      ('duración que no es entera', con('duracionMinutos', '240')),
      ('placa que no es texto', con('placa', 7)),
      ('foto sin medidas', con('foto', const {'jpegBase64': 'AAAA'})),
      ('rostros no enteros', conMedida('rostrosDetectados', 1.5)),
    ]) {
      expect(visitaDe(cuerpo), isNull, reason: nombre);
    }
  });

  test('cuerpoDe y visitaDe son la misma visita al otro lado', () async {
    final original = visita('k1');
    final ida = cuerpoDe(original);
    final vuelta = visitaDe(ida)!;

    expect(vuelta.visitante, original.visitante);
    expect(vuelta.documento, original.documento);
    expect(vuelta.inicio, original.inicio);
    expect(vuelta.duracionMinutos, 240);
    expect(vuelta.hasta, original.hasta);
    expect(vuelta.placa, original.placa);
    expect(vuelta.observaciones, original.observaciones);
    // La foto viaja ENTERA: el JPEG y las medidas con que se juzgó.
    expect(vuelta.foto.jpegBase64, original.foto.jpegBase64);
    expect(vuelta.foto.medidas.nitidez, original.foto.medidas.nitidez);
    expect(vuelta.foto.medidas.rostrosDetectados, 1);
    expect(vuelta.casillaMarcada, isTrue);
    // Y sobre todo esta: lo que hace idempotente al reintento tras un cierre
    // de la app es que la clave sobreviva al guardado.
    expect(vuelta.claveDeIdempotencia, 'k1');
  });

  test('una visita encolada se reenvía con su foto y su casilla tras volver la red', () async {
    repo.respuestas.add(const Fallo(ClaseDeFallo.sinConexion, 'sin red'));
    await envio.enviar(visita('k1'));
    reloj.avanzar(const Duration(minutes: 5));
    await envio.vaciar();

    final reenviada = repo.recibidas.last;
    expect(reenviada.foto.jpegBase64, fotoDeVisita().jpegBase64);
    expect(reenviada.casillaMarcada, isTrue);
    expect(reenviada.claveDeIdempotencia, 'k1');
  });

  test('el inicio se guarda en UTC aunque se componga en hora local', () {
    final local = DateTime(2026, 9, 20, 9, 30);
    final v = NuevaVisita(
      visitante: 'Visitante de prueba',
      documento: '1020304050',
      inicio: local,
      duracionMinutos: 60,
      foto: fotoDeVisita(),
      casillaMarcada: true,
      claveDeIdempotencia: 'k-local',
    );
    final guardado = cuerpoDe(v)['inicio']! as String;
    expect(guardado, endsWith('Z'));
    expect(visitaDe(cuerpoDe(v))!.inicio.isAtSameMomentAs(local), isTrue);
  });

  test('tras agotar los intentos, se rinde y NO se borra', () async {
    for (var i = 0; i < 12; i++) {
      repo.respuestas.add(const Fallo(ClaseDeFallo.servidor, 'quinientos'));
    }
    await envio.enviar(visita('k1'));
    for (var i = 0; i < 10; i++) {
      reloj.avanzar(const Duration(hours: 1));
      await envio.vaciar();
    }
    expect(envio.rendidos, isNotEmpty, reason: 'se rindió');
    expect(envio.bandeja.pendientes, isNotEmpty, reason: 'y sigue ahí, con su clave');
  });
}
