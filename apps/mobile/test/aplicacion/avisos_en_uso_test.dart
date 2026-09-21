import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/avisos_en_uso.dart';
import 'package:ncr_residente/dominio/calidad_de_captura.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/presentacion/pantallas/notificaciones.dart';

class RelojFijo implements Reloj {
  const RelojFijo();
  @override
  DateTime ahora() => DateTime.utc(2026, 9, 20, 12);
}

class FuenteGobernada implements FuenteDeNotificaciones {
  FuenteGobernada({this.concede = true, this.token = 'tok-1'});
  bool concede;
  String? token;
  int pedidos = 0;

  @override
  Future<bool> pedirPermiso() async {
    pedidos += 1;
    return concede;
  }

  @override
  Future<AparatoDeNotificaciones?> aparato() async {
    final t = token;
    return t == null
        ? null
        : AparatoDeNotificaciones(
            instalacionId: 'inst-1',
            token: t,
            plataforma: PlataformaDelAparato.android,
          );
  }
}

class RepoDeAvisos implements RepositorioDelResidente {
  final List<AparatoDeNotificaciones> registrados = [];
  Fallo? falla;

  @override
  Future<void> registrarAparato(AparatoDeNotificaciones a) async {
    if (falla != null) throw falla!;
    registrados.add(a);
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
  Future<ResultadoDeVisita> crearVisita(NuevaVisita v) => throw UnimplementedError();
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

void main() {
  late FuenteGobernada fuente;
  late RepoDeAvisos repo;
  late ControladorDeAvisos avisos;

  setUp(() {
    fuente = FuenteGobernada();
    repo = RepoDeAvisos();
    avisos = ControladorDeAvisos(
      fuente: fuente,
      repositorio: repo,
      reloj: const RelojFijo(),
    );
  });

  test('el camino feliz llega hasta REGISTRADO, no hasta «con permiso»', () async {
    await avisos.activar();
    expect(avisos.estado, EstadoDeAvisos.registrado);
    expect(repo.registrados.single.token, 'tok-1');
  });

  test('permiso negado NO es un error y se distingue de todo lo demás', () async {
    fuente.concede = false;
    await avisos.activar();
    expect(avisos.estado, EstadoDeAvisos.permisoNegado);
    expect(repo.registrados, isEmpty);
  });

  test('LA CONFUSIÓN QUE ESTO EVITA · con permiso y sin token no dice «activadas»', () async {
    fuente.token = null;
    await avisos.activar();
    expect(avisos.estado, EstadoDeAvisos.sinToken);
  });

  test('un fallo de red deja SIN REGISTRAR con su detalle, no sin permiso', () async {
    // Confundirlos haría que la app le pidiera al residente que volviera a dar
    // un permiso que ya dio, y seguiría sin llegarle nada.
    repo.falla = const Fallo(ClaseDeFallo.servidor, 'quinientos');
    await avisos.activar();
    expect(avisos.estado, EstadoDeAvisos.sinRegistrar);
    expect(avisos.detalleDelFallo, 'quinientos');
  });

  test('asegurarRegistro NO pide permiso: se llama en cada arranque', () async {
    await avisos.asegurarRegistro();
    expect(fuente.pedidos, 0);
    expect(avisos.estado, EstadoDeAvisos.registrado);
  });

  test('registrado y con el mismo token, no vuelve a molestar al servidor', () async {
    await avisos.activar();
    await avisos.asegurarRegistro();
    await avisos.asegurarRegistro();
    expect(repo.registrados.length, 1);
  });

  test('EL TOKEN ROTA · si cambia, se reenvía solo', () async {
    // Caduca, cambia al reinstalar, cambia al restaurar una copia. Sin esto,
    // los avisos dejarían de llegar en silencio y nadie se enteraría hasta que
    // un visitante esperara en la portería.
    await avisos.activar();
    fuente.token = 'tok-2';
    await avisos.asegurarRegistro();
    expect(repo.registrados.map((a) => a.token), ['tok-1', 'tok-2']);
  });

  test('al cerrar sesión se olvida: el registro es de la cuenta, no del aparato', () async {
    await avisos.activar();
    avisos.olvidar();
    expect(avisos.estado, EstadoDeAvisos.sinDeterminar);

    // Y la cuenta siguiente en el mismo teléfono SÍ vuelve a registrarse.
    await avisos.asegurarRegistro();
    expect(repo.registrados.length, 2);
  });

  test('el resumen del perfil cubre los cinco estados y ninguno dice el enum', () {
    for (final e in EstadoDeAvisos.values) {
      final texto = resumenDeAvisos(e);
      expect(texto.length, greaterThan(8));
      expect(texto, isNot(contains(e.name)));
    }
  });
}
