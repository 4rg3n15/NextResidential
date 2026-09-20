import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/envio_de_visitas.dart';
import 'package:ncr_residente/dominio/calidad_de_captura.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';

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
  Future<ResultadoDeCaptura> capturarRostro({
    required String autorizacionId,
    required MedidasDeCaptura medidas,
    required Uint8List vector,
    required String versionPolitica,
    required DateTime suprimirEn,
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

NuevaVisita visita(String clave) => NuevaVisita(
      visitante: 'Visitante de prueba',
      documento: '1020304050',
      desde: DateTime.utc(2026, 9, 20, 14),
      hasta: DateTime.utc(2026, 9, 20, 18),
      placa: 'ABC123',
      permiteAccesoVehicular: true,
      acompanantes: const ['Acompañante'],
      zonasPermitidas: const ['z1'],
      observaciones: 'sin observaciones',
      patron: const PatronDeVisita(
        dias: {DiaDeSemana.lunes, DiaDeSemana.miercoles},
        minutoInicio: 480,
        minutoFin: 1200,
        desplazamientoUtcMinutos: -300,
      ),
      claveDeIdempotencia: clave,
    );

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
    expect((r as Rechazado).resultado.motivo, MotivoDeRechazo.listaNegra);
    // Insistir ocho veces no la va a sacar de la lista negra.
    expect(envio.bandeja.pendientes, isEmpty);
    expect(envio.rechazos['k1'], isNotNull);
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

  test('cuerpoDe y visitaDe son la misma visita al otro lado', () async {
    final original = visita('k1');
    final ida = cuerpoDe(original);
    final vuelta = visitaDe(ida)!;

    expect(vuelta.visitante, original.visitante);
    expect(vuelta.desde, original.desde);
    expect(vuelta.acompanantes, original.acompanantes);
    expect(vuelta.zonasPermitidas, original.zonasPermitidas);
    expect(vuelta.patron!.dias, original.patron!.dias);
    expect(vuelta.patron!.minutoFin, original.patron!.minutoFin);
    // Y sobre todo esta: lo que hace idempotente al reintento tras un cierre
    // de la app es que la clave sobreviva al guardado.
    expect(vuelta.claveDeIdempotencia, 'k1');
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
