import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/envio_de_visitas.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/infraestructura/almacen/almacen_de_texto.dart';
import 'package:ncr_residente/infraestructura/bandeja/bandeja_guardada.dart';

import '../dobles/sincronizacion.dart';
import '../dobles/visitas.dart';
import 'envio_de_visitas_test.dart' show RelojMovible, RepoDeEnvio;

/// 15-L · LA BANDEJA SOBREVIVE AL CIERRE DE LA APP, y sigue sin duplicar.
///
/// El servidor falso de aquí deduplica POR CLAVE, como el de verdad: cuenta
/// las llamadas por clave y las visitas creadas. Es lo que permite afirmar
/// «enviada una vez» en vez de «enviada».
class ServidorQueDeduplica extends RepoDeEnvio {
  bool hayRed = true;

  /// El servidor la crea y la respuesta se pierde por el camino.
  bool perderLaRespuesta = false;
  final Map<String, int> llamadasPorClave = {};
  final Map<String, String> creadas = {};

  @override
  Future<ResultadoDeVisita> crearVisita(NuevaVisita visita) async {
    final clave = visita.claveDeIdempotencia;
    if (!hayRed) throw const Fallo(ClaseDeFallo.sinConexion, 'sin red');
    llamadasPorClave[clave] = (llamadasPorClave[clave] ?? 0) + 1;
    final repetida = creadas.containsKey(clave);
    final id = creadas.putIfAbsent(clave, () => 'aut-${creadas.length + 1}');
    if (perderLaRespuesta) {
      perderLaRespuesta = false;
      throw const Fallo(ClaseDeFallo.sinConexion, 'se cortó la respuesta');
    }
    return VisitaCreada(id: id, repetida: repetida);
  }
}

void main() {
  late RelojMovible reloj;
  late ServidorQueDeduplica servidor;
  late AlmacenDeTextoEnMemoria llavero;
  String? propietario;

  EnvioDeVisitas arrancar({int maximo = 10}) => EnvioDeVisitas(
        repositorio: servidor,
        reloj: reloj,
        almacen: BandejaGuardada(llavero),
        propietario: () => propietario,
        maximoPendientes: maximo,
      );

  setUp(() {
    reloj = RelojMovible(DateTime.utc(2026, 9, 20, 12));
    servidor = ServidorQueDeduplica();
    llavero = AlmacenDeTextoEnMemoria();
    propietario = 'ana@cop';
  });

  test('SIN RED → PENDIENTE → SE CIERRA LA APP → vuelve la red → enviada UNA vez', () async {
    servidor.hayRed = false;
    final antes = arrancar();
    await antes.recuperar();
    expect(await antes.enviar(visitaDePrueba('k1')), isA<Pendiente>());

    // «Cerrar y volver a abrir»: otra instancia, el mismo llavero.
    final despues = arrancar();
    await despues.recuperar();
    final guardada = despues.bandeja.pendientes.single;
    expect(guardada.claveDeIdempotencia, 'k1');
    expect(visitaDe(guardada.cuerpo)!.foto.jpegBase64, fotoDeVisita().jpegBase64);

    servidor.hayRed = true;
    reloj.avanzar(const Duration(minutes: 5));
    expect(await despues.vaciar(), 1);
    expect(servidor.llamadasPorClave, {'k1': 1});
    expect(despues.bandeja.pendientes, isEmpty);

    // Y lo que se envió ya no está en el llavero: ni el índice ni la foto.
    expect(llavero.datos[BandejaGuardada.claveDelCuerpo('k1')], isNull);
    final otraVez = arrancar();
    await otraVez.recuperar();
    expect(otraVez.bandeja.pendientes, isEmpty);
  });

  test('LA RESPUESTA SE PERDIÓ · el reintento con la MISMA clave no crea otra visita', () async {
    servidor.perderLaRespuesta = true;
    final envio = arrancar();
    expect(await envio.enviar(visitaDePrueba('k1')), isA<Pendiente>());
    reloj.avanzar(const Duration(minutes: 5));
    await envio.vaciar();

    expect(servidor.llamadasPorClave, {'k1': 2}, reason: 'se envió dos veces…');
    expect(servidor.creadas, hasLength(1), reason: '…y el servidor creó UNA');
    expect(envio.bandeja.pendientes, isEmpty);
  });

  test('lo que encoló una cuenta NO sale con la sesión de otra', () async {
    servidor.hayRed = false;
    final envio = arrancar();
    await envio.enviar(visitaDePrueba('de-ana'));

    propietario = 'luis@cop';
    servidor.hayRed = true;
    reloj.avanzar(const Duration(minutes: 5));
    expect(envio.bandeja.pendientes, isEmpty, reason: 'Luis no ve lo de Ana');
    expect(await envio.vaciar(), 0);
    expect(servidor.llamadasPorClave, isEmpty);

    propietario = 'ana@cop';
    expect(await envio.vaciar(), 1);
    expect(servidor.llamadasPorClave, {'de-ana': 1});
  });

  test('NUNCA DOS ENVÍOS DE LA MISMA VISITA A LA VEZ', () async {
    final enVuelo = Completer<void>();
    final lento = _ServidorLento(enVuelo.future);
    final envio = EnvioDeVisitas(repositorio: lento, reloj: reloj);
    final primero = envio.enviar(visitaDePrueba('k1'));
    // El botón otra vez, el ciclo y la red que vuelve, mientras la primera vuela.
    expect(await envio.enviar(visitaDePrueba('k1')), isA<Pendiente>());
    final vaciados = [envio.vaciar(), envio.vaciar()];
    enVuelo.complete();
    expect(await primero, isA<Aceptado>());
    await Future.wait(vaciados);
    expect(lento.llamadas, 1);
  });

  test('BANDEJA LLENA · con red sale igual; sin red lo dice y no la guarda', () async {
    servidor.hayRed = false;
    final envio = arrancar(maximo: 1);
    await envio.enviar(visitaDePrueba('k1'));
    await expectLater(
      envio.enviar(visitaDePrueba('k2')),
      throwsA(isA<Fallo>().having((f) => f.detalle, 'detalle', contains('esperando conexión'))),
    );
    expect(envio.bandeja.pendientes.map((p) => p.claveDeIdempotencia), ['k1']);

    servidor.hayRed = true;
    expect(await envio.enviar(visitaDePrueba('k3')), isA<Aceptado>());
    expect(envio.bandeja.pendientes.map((p) => p.claveDeIdempotencia), ['k1']);
  });

  test('bandeja llena y un rechazo de negocio: es respuesta, no fallo', () async {
    servidor.hayRed = false;
    final envio = arrancar(maximo: 1);
    await envio.enviar(visitaDePrueba('k1'));
    final rechazador = EnvioDeVisitas(
      repositorio: RepoDeEnvio()
        ..respuestas.add(
          const VisitaRechazada(motivo: MotivoDeRechazo.listaNegra, explicacion: 'No.'),
        ),
      reloj: reloj,
      maximoPendientes: 0,
    );
    expect(await rechazador.enviar(visitaDePrueba('k9')), isA<Rechazado>());
    final autorizador = EnvioDeVisitas(repositorio: RepoDeEnvio()
      ..respuestas.add(const Fallo(ClaseDeFallo.sinPermiso, 'no')), reloj: reloj, maximoPendientes: 0);
    await expectLater(autorizador.enviar(visitaDePrueba('k8')), throwsA(isA<Fallo>()));
  });

  test('un llavero roto no impide enviar: la bandeja sigue en memoria', () async {
    final envio = EnvioDeVisitas(
      repositorio: servidor..hayRed = false,
      reloj: reloj,
      almacen: BandejaGuardada(AlmacenRoto()),
    );
    await envio.recuperar();
    expect(await envio.enviar(visitaDePrueba('k1')), isA<Pendiente>());
    servidor.hayRed = true;
    reloj.avanzar(const Duration(minutes: 5));
    expect(await envio.vaciar(), 1);
  });

  test('encolar antes de haber leído lo guardado no lo pisa: se lee primero', () async {
    servidor.hayRed = false;
    final antes = arrancar();
    await antes.enviar(visitaDePrueba('guardada'));

    // Sin `recuperar()` explícito: la primera escritura lo espera sola.
    final despues = arrancar();
    await despues.enviar(visitaDePrueba('nueva'));
    expect(
      despues.bandeja.pendientes.map((p) => p.claveDeIdempotencia).toSet(),
      {'guardada', 'nueva'},
    );
  });
}

class _ServidorLento extends RepoDeEnvio {
  _ServidorLento(this._espera);
  final Future<void> _espera;
  int llamadas = 0;

  @override
  Future<ResultadoDeVisita> crearVisita(NuevaVisita visita) async {
    llamadas += 1;
    await _espera;
    return VisitaCreada(id: 'a-$llamadas', repetida: false);
  }
}
