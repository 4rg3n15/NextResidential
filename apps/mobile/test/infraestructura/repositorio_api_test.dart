import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/calidad_de_captura.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/api/generado/clients/residente_api.dart';
import 'package:ncr_residente/infraestructura/api/generado/models/patron_de_visita_dto.dart';
import 'package:ncr_residente/infraestructura/api/generado/models/token_de_notificacion_dto_plataforma.dart';
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

  // ═══════════════════════════════════════════════════════════════════════════
  // LAS CUATRO OPERACIONES DE 11-C, POR LA LECCIÓN DE D-89
  //
  // En el servidor, dos consultas del adaptador del residente no existían en el
  // esquema y la suite estaba verde porque probaba un doble. Aquí el riesgo es
  // el simétrico: el adaptador traduce entre el DTO generado y la entidad, y si
  // esa traducción no se ejerce, ningún otro control la mira —las pantallas se
  // prueban con dobles y el compilador solo ve los tipos, no el significado—.
  // ═══════════════════════════════════════════════════════════════════════════

  group('los mapeadores que nadie más mira', () {
    // El compilador solo ve los tipos, no el significado, y las pantallas se
    // prueban con dobles: si la traducción DTO → entidad no se ejerce aquí, no
    // se ejerce en ninguna parte. Es la lección de D-89 en el otro lado.

    test('familia: el titular, el nivel y el inactivo llegan tal cual', () async {
      final (repo, _) = await montar(
        (_, _) => json(200, [
          {
            'residenteId': 'r-1',
            'nombre': 'Maria Titular',
            'parentesco': 'Propietario',
            'esTitular': true,
            'nivelAcceso': 'acceso_completo',
            'activo': true,
          },
          {
            'residenteId': 'r-2',
            'nombre': 'Antiguo Residente',
            'parentesco': null,
            'esTitular': false,
            'nivelAcceso': null,
            'activo': false,
          },
        ]),
      );
      final familia = await repo.miFamilia();
      expect(familia.first.esTitular, isTrue);
      // El inactivo NO se filtra aquí: RN-19 conserva el historial y la
      // pantalla lo enseña distinto. Filtrarlo en el adaptador lo borraría.
      expect(familia.last.activo, isFalse);
      expect(familia.last.nivelAcceso, isNull);
    });

    test('vehículos: la placa y el principal', () async {
      final (repo, _) = await montar(
        (_, _) => json(200, [
          {
            'id': 'v-1',
            'placa': 'ABC123',
            'marca': 'Marca',
            'modelo': null,
            'color': null,
            'esPrincipal': true,
            'activo': true,
          },
        ]),
      );
      final vehiculos = await repo.misVehiculos();
      expect(vehiculos.single.placa, 'ABC123');
      expect(vehiculos.single.esPrincipal, isTrue);
    });

    test('autorizaciones: las fechas se parsean y los acompañantes se cuentan', () async {
      final (repo, _) = await montar(
        (_, _) => json(200, [
          {
            'id': 'a-1',
            'visitante': 'Plomero',
            'tipo': 'unica',
            'desde': '2026-09-20T14:00:00.000Z',
            'hasta': '2026-09-20T18:00:00.000Z',
            'placa': 'XYZ789',
            'permiteAccesoVehicular': true,
            'estado': 'activa',
            'acompanantes': 2,
          },
        ]),
      );
      final a = (await repo.misAutorizaciones()).single;
      expect(a.desde.toUtc().hour, 14);
      expect(a.acompanantes, 2);
      expect(a.vigenteEn(DateTime.utc(2026, 9, 20, 15)), isTrue);
      expect(a.vigenteEn(DateTime.utc(2026, 9, 20, 19)), isFalse);
    });

    test('historial: el evento decidido por el Edge se distingue (CA-21)', () async {
      final (repo, _) = await montar(
        (_, _) => json(200, [
          {
            'id': 'e-1',
            'ocurridoEn': '2026-09-20T09:00:00.000Z',
            'tipo': 'acceso',
            'resultado': 'negado',
            'motivo': 'FUERA_DE_HORARIO',
            'metodo': 'placa',
            'placaDetectada': 'DEF456',
            'persona': 'Visitante',
            'zona': 'Piscina',
            'decididoPorEdge': true,
          },
        ]),
      );
      final e = (await repo.miHistorial(PeriodoDeHistorial.mes)).single;
      expect(e.decididoPorEdge, isTrue);
      expect(e.negado, isTrue);
      expect(e.motivo, 'FUERA_DE_HORARIO');
    });
  });

  group('M-5 · zonas', () {
    test('traduce la zona con su aforo, su estado y sus franjas', () async {
      final (repo, _) = await montar(
        (_, _) => json(200, [
          {
            'id': 'z-1',
            'nombre': 'Piscina',
            'aforoMaximo': 20,
            'ocupacionActual': 17,
            'abiertaAhora': true,
            'franjasDeHoy': [
              {'desde': '2026-09-20T13:00:00.000Z', 'hasta': '2026-09-20T23:00:00.000Z'},
            ],
            'requiereAutorizacion': true,
          },
        ]),
      );

      final zonas = await repo.misZonas();
      expect(zonas.single.nombre, 'Piscina');
      expect(zonas.single.plazasLibres, 3);
      expect(zonas.single.lleno, isFalse);
      expect(zonas.single.franjasDeHoy.single.hasta.toUtc().hour, 23);
    });
  });

  group('M-4 · crear visita', () {
    NuevaVisita visita({String? placa}) => NuevaVisita(
          visitante: 'Plomero',
          documento: '1020304050',
          desde: DateTime.utc(2026, 9, 20, 14),
          hasta: DateTime.utc(2026, 9, 20, 18),
          placa: placa,
          permiteAccesoVehicular: placa != null,
          acompanantes: const ['Ayudante'],
          zonasPermitidas: const ['z-1'],
          observaciones: null,
          patron: const PatronDeVisita(
            dias: {DiaDeSemana.lunes},
            minutoInicio: 480,
            minutoFin: 1080,
            desplazamientoUtcMinutos: -300,
          ),
          claveDeIdempotencia: 'k-1',
        );

    test('envía la clave y las fechas EN UTC, no la hora local del teléfono', () async {
      final (repo, servidor) = await montar(
        (_, _) => json(201, {
          'creada': true,
          'id': 'a-1',
          'repetida': false,
          'motivo': null,
          'explicacion': null,
        }),
      );
      final r = await repo.crearVisita(visita());

      expect(r, isA<VisitaCreada>());
      expect((r as VisitaCreada).id, 'a-1');
      // `data` es el mapa que produjo el cliente generado; los campos
      // anidados siguen siendo objetos suyos hasta que Dio los serializa.
      final cuerpo = servidor.peticiones.single.data as Map<String, dynamic>;
      expect(cuerpo['claveDeIdempotencia'], 'k-1');
      expect(cuerpo['desde'], endsWith('Z'));
      expect((cuerpo['patron'] as PatronDeVisitaDto).minutoFin, 1080);
    });

    test('los cuatro motivos tipados se traducen, con su explicación', () async {
      for (final (texto, esperado) in const [
        ('LISTA_NEGRA', MotivoDeRechazo.listaNegra),
        ('VIVIENDA_INACTIVA', MotivoDeRechazo.viviendaInactiva),
        ('SIN_NIVEL_DE_ACCESO', MotivoDeRechazo.sinNivelDeAcceso),
        ('PLACA_DUPLICADA', MotivoDeRechazo.placaDuplicada),
      ]) {
        final (repo, _) = await montar(
          (_, _) => json(201, {
            'creada': false,
            'id': null,
            'repetida': false,
            'motivo': texto,
            'explicacion': 'El dominio escribe este texto.',
          }),
        );
        final r = await repo.crearVisita(visita());
        expect(r, isA<VisitaRechazada>(), reason: texto);
        expect((r as VisitaRechazada).motivo, esperado);
        expect(r.explicacion, 'El dominio escribe este texto.');
      }
    });

    test('UN MOTIVO DESCONOCIDO NO se toma por creada', () async {
      // Es la dirección segura de §2.1.4: una versión nueva del servidor con un
      // motivo que esta app no conoce tiene que seguir siendo un rechazo. Lo
      // contrario diría «visita registrada» sobre algo que el conjunto negó.
      final (repo, _) = await montar(
        (_, _) => json(201, {
          'creada': false,
          'id': null,
          'repetida': false,
          'motivo': 'MOTIVO_DEL_FUTURO',
          'explicacion': 'No se pudo.',
        }),
      );
      expect(await repo.crearVisita(visita()), isA<VisitaRechazada>());
    });
  });

  group('M-7 · registro del aparato', () {
    test('envía la instalación, el token y la plataforma', () async {
      final (repo, servidor) = await montar((_, _) => json(201, {'id': 'd-1'}));
      await repo.registrarAparato(
        const AparatoDeNotificaciones(
          instalacionId: 'inst-1',
          token: 'tok-1',
          plataforma: PlataformaDelAparato.ios,
        ),
      );
      final cuerpo = servidor.peticiones.single.data as Map<String, dynamic>;
      expect(cuerpo['instalacionId'], 'inst-1');
      expect(cuerpo['plataforma'], TokenDeNotificacionDtoPlataforma.ios);
    });
  });

  group('CU-02 · captura de rostro', () {
    const medidas = MedidasDeCaptura(
      nitidez: 0.8,
      iluminacion: 0.5,
      rostrosDetectados: 1,
      proporcionRostro: 0.4,
    );

    Future<ResultadoDeCaptura> capturar(RepositorioApiDelResidente repo) => repo.capturarRostro(
          autorizacionId: 'a-1',
          medidas: medidas,
          vector: Uint8List.fromList(List<int>.filled(32, 9)),
          versionPolitica: 'v1.0',
          suprimirEn: DateTime.utc(2026, 9, 21, 12),
        );

    test('el vector viaja en base64 y la ruta cuelga de la AUTORIZACIÓN', () async {
      final (repo, servidor) = await montar(
        (_, _) => json(201, {
          'aceptada': true,
          'motivos': <String>[],
          'plantillaId': 'p-1',
          'consentimientoId': 'c-1',
          'titular': 'Plomero Pérez',
          'calidad': 0.87,
        }),
      );
      final r = await capturar(repo);

      expect(r, isA<CapturaAceptada>());
      expect((r as CapturaAceptada).titular, 'Plomero Pérez');
      // De la autorización sale el titular: RN-10 vive en la forma de la ruta.
      expect(servidor.peticiones.single.path, contains('/autorizaciones/a-1/rostro'));
      final cuerpo = servidor.peticiones.single.data as Map<String, dynamic>;
      expect(base64Decode(cuerpo['vector'] as String).length, 32);
      // Y lo que NO va: el titular. Si el cuerpo lo llevara, la app podría
      // pedirle el consentimiento a quien quisiera.
      expect(cuerpo.containsKey('titularId'), isFalse);
    });

    test('un rechazo de calidad del servidor llega con sus motivos (KPI-16)', () async {
      final (repo, _) = await montar(
        (_, _) => json(201, {
          'aceptada': false,
          'motivos': ['NITIDEZ', 'ROSTROS_MULTIPLES'],
          'plantillaId': null,
          'consentimientoId': null,
          'titular': null,
          'calidad': null,
        }),
      );
      final r = await capturar(repo);
      expect(r, isA<CapturaRechazada>());
      expect((r as CapturaRechazada).motivos, ['NITIDEZ', 'ROSTROS_MULTIPLES']);
    });

    test('aceptada SIN consentimiento es contrato roto, y se dice', () async {
      // Tratarlo como éxito dejaría al residente creyendo que el trámite acabó
      // cuando no hay a quién pedirle nada.
      final (repo, _) = await montar(
        (_, _) => json(201, {
          'aceptada': true,
          'motivos': <String>[],
          'plantillaId': 'p-1',
          'consentimientoId': null,
          'titular': 'Plomero',
          'calidad': 0.9,
        }),
      );
      await expectLater(
        capturar(repo),
        throwsA(
          isA<Fallo>().having((f) => f.detalle, 'detalle', contains('sin solicitud')),
        ),
      );
    });
  });
}
