import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/api/generado/clients/residente_api.dart';
import 'package:ncr_residente/infraestructura/api/repositorio_api.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';

/// Adaptador de transporte falso. No hay librería de dobles: lo que hace falta
/// es controlar qué contesta el servidor, y eso son veinte líneas.
class ServidorFalso implements HttpClientAdapter {
  ServidorFalso(this.responder);

  /// Recibe la petición y decide la respuesta. Guarda también las cabeceras,
  /// que es donde se comprueba el token.
  final ResponseBody Function(RequestOptions opciones, int intento) responder;

  final List<RequestOptions> peticiones = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    peticiones.add(options);
    return responder(options, peticiones.length);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody json(int codigo, Object cuerpo) => ResponseBody.fromString(
      jsonEncode(cuerpo),
      codigo,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

class RelojFijo implements Reloj {
  const RelojFijo();
  @override
  DateTime ahora() => DateTime.utc(2026, 9, 18, 12);
}

class AutenticadorDePrueba implements Autenticador {
  int renovaciones = 0;

  Sesion _sesion(String token) => Sesion(
        tokenDeAcceso: token,
        tokenDeRefresco: 'r',
        expiraEn: DateTime.utc(2026, 9, 18, 12, 5),
        usuarioId: 'u',
        copropiedadId: 'cop-1',
        correo: 'residente@ejemplo.invalid',
      );

  @override
  Future<Sesion> iniciarSesion({required String correo, required String clave}) async =>
      _sesion('token-1');

  @override
  Future<Sesion> renovar(Sesion sesion) async {
    renovaciones += 1;
    return _sesion('token-2');
  }
}

void main() {
  late AutenticadorDePrueba autenticador;
  late SesionEnUso sesion;

  Future<(RepositorioApiDelResidente, ServidorFalso)> montar(
    ResponseBody Function(RequestOptions, int) responder,
  ) async {
    autenticador = AutenticadorDePrueba();
    sesion = SesionEnUso(
      almacen: AlmacenEnMemoria(),
      autenticador: autenticador,
      reloj: const RelojFijo(),
    );
    await sesion.iniciar(correo: 'x@y.invalid', clave: 'z');
    final servidor = ServidorFalso(responder);
    final dio = crearDioDeApi(urlBase: 'http://api.invalid', sesion: sesion);
    dio.httpClientAdapter = servidor;
    return (
      RepositorioApiDelResidente(api: ResidenteApi(dio), sesion: sesion),
      servidor,
    );
  }

  const viviendaJson = {
    'vivienda': {
      'id': 'v-1',
      'identificador': '42',
      'agrupacion': 'B',
      'etiquetaVivienda': 'Casa',
      'etiquetaAgrupacion': 'Manzana',
      'direccion': null,
      'copropiedadNombre': 'Conjunto',
      'estadoAdministrativo': 'al_dia',
      'activa': true,
    },
    'vinculo': {'residenteId': 'r-1', 'esTitular': true, 'nivelAcceso': 'acceso_completo'},
    'puedeAutorizar': true,
  };

  test('traduce el DTO a entidad y compone el título con las etiquetas', () async {
    final (repo, _) = await montar((_, _) => json(200, viviendaJson));
    final hogar = await repo.miHogar();

    expect(hogar.vivienda.titulo, 'Casa 42 · Manzana B');
    expect(hogar.puedeAutorizar, isTrue);
  });

  test('la petición sale con el token de la sesión en la cabecera', () async {
    final (repo, servidor) = await montar((_, _) => json(200, viviendaJson));
    await repo.miHogar();

    expect(servidor.peticiones.single.headers['Authorization'], 'Bearer token-1');
    // Y con la copropiedad de los claims en la ruta, que es lo que la API exige.
    expect(servidor.peticiones.single.path, contains('cop-1'));
  });

  test('un 401 renueva UNA vez y reintenta con el token nuevo', () async {
    // El 401 sigue tratándose —un token puede revocarse en el servidor— pero
    // como excepción, no como mecanismo de renovación.
    final (repo, servidor) = await montar(
      (_, intento) => intento == 1 ? json(401, {'mensaje': 'token revocado'}) : json(200, viviendaJson),
    );

    final hogar = await repo.miHogar();

    expect(hogar.vivienda.identificador, '42');
    expect(autenticador.renovaciones, 1);
    expect(servidor.peticiones.length, 2);
    expect(servidor.peticiones.last.headers['Authorization'], 'Bearer token-2');
  });

  test('dos 401 seguidos NO entran en bucle: se rinde como sesión inválida', () async {
    final (repo, servidor) = await montar((_, _) => json(401, {'mensaje': 'no'}));

    await expectLater(
      repo.miHogar(),
      throwsA(
        isA<Fallo>().having((f) => f.clase, 'clase', ClaseDeFallo.sesionInvalida),
      ),
    );
    expect(servidor.peticiones.length, 2, reason: 'un reintento, no una cascada');
  });

  test('un 404 es «sin vivienda», que es un estado previsto y no un error', () async {
    final (repo, _) = await montar(
      (_, _) => json(404, {'mensaje': 'La identidad no tiene una vivienda activa asignada'}),
    );

    await expectLater(
      repo.miHogar(),
      throwsA(
        isA<Fallo>()
            .having((f) => f.clase, 'clase', ClaseDeFallo.sinVivienda)
            .having((f) => f.detalle, 'detalle', contains('vivienda activa')),
      ),
    );
  });

  test('un 403 es sin permiso, y NO se confunde con sesión inválida', () async {
    final (repo, _) = await montar((_, _) => json(403, {'mensaje': 'otra copropiedad'}));
    await expectLater(
      repo.miHogar(),
      throwsA(isA<Fallo>().having((f) => f.clase, 'clase', ClaseDeFallo.sinPermiso)),
    );
  });

  test('el cuerpo anidado de Nest se desenvuelve en vez de mostrarse crudo', () async {
    // El filtro global de la API envuelve `{estado, correlacion, mensaje}` y
    // `mensaje` puede ser a su vez el objeto de Nest. Suponer una sola forma es
    // lo que rompió la suite de la API cuando el filtro no estaba en el banco.
    final (repo, _) = await montar(
      (_, _) => json(500, {
        'estado': 500,
        'correlacion': 'abc',
        'mensaje': {'message': 'algo se rompió por dentro', 'statusCode': 500},
      }),
    );
    await expectLater(
      repo.miHogar(),
      throwsA(
        isA<Fallo>().having((f) => f.detalle, 'detalle', 'algo se rompió por dentro'),
      ),
    );
  });

  test('sin copropiedad en los claims, lo dice en vez de pedir una ruta rota', () async {
    final (repo, servidor) = await montar((_, _) => json(200, viviendaJson));
    await sesion.cerrar();

    await expectLater(
      repo.miHogar(),
      throwsA(
        isA<Fallo>().having((f) => f.detalle, 'detalle', contains('no está asociada')),
      ),
    );
    expect(servidor.peticiones, isEmpty, reason: 'ni se intenta la petición');
  });

  test('el historial traduce el periodo del dominio al del contrato', () async {
    final (repo, servidor) = await montar((_, _) => json(200, []));
    await repo.miHistorial(PeriodoDeHistorial.semana);

    expect(servidor.peticiones.single.queryParameters['periodo'], 'semana');
  });
}
