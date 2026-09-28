import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/api/generado/clients/residente_api.dart';
import 'package:ncr_residente/infraestructura/api/generado/models/token_de_notificacion_dto_plataforma.dart';
import 'package:ncr_residente/infraestructura/api/repositorio_api.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';

import '../dobles/visitas.dart';

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
  Future<Sesion> iniciarSesion(IdentificadorDeAcceso identificador, {required String clave}) async =>
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
    await sesion.iniciar(identificador: PorCorreo('x@y.invalid'), clave: 'z');
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
            'situacion': 'vigente',
            'motivoRechazo': null,
          },
        ]),
      );
      final a = (await repo.misAutorizaciones()).single;
      expect(a.desde.toUtc().hour, 14);
      expect(a.acompanantes, 2);
      // 15-L · la situación la da el servidor; la app no la recalcula.
      expect(a.situacion, SituacionDeVisita.vigente);
      expect(a.motivoRechazo, isNull);
    });

    test('autorizaciones: las cuatro situaciones del servidor, y la rechazada con su motivo',
        () async {
      Map<String, Object?> una(String id, String situacion, [String? motivo]) => {
            'id': id,
            'visitante': 'Visitante $id',
            'tipo': 'unica',
            'desde': '2026-09-20T14:00:00.000Z',
            'hasta': '2026-09-20T18:00:00.000Z',
            'placa': null,
            'permiteAccesoVehicular': false,
            'estado': situacion == 'rechazada' ? 'revocada' : 'activa',
            'acompanantes': 0,
            'situacion': situacion,
            'motivoRechazo': motivo,
          };
      final (repo, _) = await montar(
        (_, _) => json(200, [
          una('a-1', 'vigente'),
          una('a-2', 'programada'),
          una('a-3', 'vencida'),
          una('a-4', 'rechazada', 'El residente no la espera'),
          una('a-5', 'situacion_del_futuro'),
        ]),
      );
      final l = await repo.misAutorizaciones();
      expect(l.map((a) => a.situacion), [
        SituacionDeVisita.vigente,
        SituacionDeVisita.programada,
        SituacionDeVisita.vencida,
        SituacionDeVisita.rechazada,
        // Una que esta versión no conoce no se disfraza de otra.
        SituacionDeVisita.desconocida,
      ]);
      expect(l[3].motivoRechazo, 'El residente no la espera');
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
            'deVisitante': true,
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

  /// Lo que vio el servidor: el cuerpo después de pasar por JSON, que es
  /// donde los objetos anidados del cliente generado se vuelven mapas.
  Map<String, dynamic> cuerpoEnviado(ServidorFalso servidor) =>
      jsonDecode(jsonEncode(servidor.peticiones.single.data)) as Map<String, dynamic>;

  Map<String, Object?> generada({
    bool creada = true,
    String? id = 'a-1',
    bool repetida = false,
    String? motivo,
    String? explicacion,
    List<String> motivosDeFoto = const [],
    int equipos = 3,
    int sincronizadas = 2,
    int fallidas = 1,
    String? aviso,
  }) =>
      {
        'creada': creada,
        'id': id,
        'repetida': repetida,
        'motivo': motivo,
        'explicacion': explicacion,
        'motivosDeFoto': motivosDeFoto,
        'equipos': equipos,
        'sincronizadas': sincronizadas,
        'fallidas': fallidas,
        'avisoDeSincronizacion': aviso,
      };

  group('F1 · crear visita con foto y casilla', () {
    test('va a mi/visitas con inicio EN UTC, duración, foto y casilla, y SIN vivienda', () async {
      final (repo, servidor) = await montar((_, _) => json(200, generada()));
      final local = DateTime(2026, 9, 20, 9, 30);
      final r = await repo.crearVisita(
        NuevaVisita(
          visitante: 'Plomero Pérez',
          documento: '79000111',
          inicio: local,
          duracionMinutos: 120,
          placa: 'ABC123',
          foto: fotoDeVisita(),
          casillaMarcada: true,
          claveDeIdempotencia: 'k-000001',
        ),
      );

      expect(servidor.peticiones.single.method, 'POST');
      expect(servidor.peticiones.single.path, '/copropiedades/cop-1/mi/visitas');
      final cuerpo = cuerpoEnviado(servidor);
      expect(cuerpo['nombre'], 'Plomero Pérez');
      expect(cuerpo['documento'], '79000111');
      // La API espera ISO-8601 CON zona: la hora local del teléfono sin huso
      // la interpretaría el servidor en el suyo.
      expect(cuerpo['inicio'], endsWith('Z'));
      expect(DateTime.parse(cuerpo['inicio'] as String).isAtSameMomentAs(local), isTrue);
      expect(cuerpo['duracionMinutos'], 120);
      expect(cuerpo['casillaMarcada'], isTrue);
      expect(cuerpo['claveDeIdempotencia'], 'k-000001');
      final foto = cuerpo['foto'] as Map<String, dynamic>;
      expect(foto['tipoMime'], 'image/jpeg');
      expect(base64Decode(foto['contenidoBase64'] as String), bytesDeJpeg);
      expect((foto['medidas'] as Map)['rostrosDetectados'], 1);
      // Y lo que NO va: la vivienda. La deriva el servidor del vínculo.
      expect(cuerpo.keys.where((k) => k.toLowerCase().contains('vivienda')), isEmpty);

      expect(r, isA<VisitaCreada>());
      final v = r as VisitaCreada;
      expect(v.id, 'a-1');
      expect((v.equipos, v.sincronizadas, v.fallidas), (3, 2, 1));
    });

    test('una foto que el servidor no aceptó llega como FotoRechazada, con sus motivos', () async {
      final (repo, _) = await montar(
        (_, _) => json(
          200,
          generada(creada: false, id: null, motivosDeFoto: ['NITIDEZ', 'ROSTROS_MULTIPLES']),
        ),
      );
      final r = await repo.crearVisita(visitaDePrueba('k-000002'));
      expect(r, isA<FotoRechazada>());
      expect((r as FotoRechazada).motivos, ['NITIDEZ', 'ROSTROS_MULTIPLES']);
      expect(r.razones, ['la foto está borrosa', 'se ve más de un rostro']);
    });

    test('los cuatro motivos tipados se traducen, con su explicación', () async {
      for (final (texto, esperado) in const [
        ('LISTA_NEGRA', MotivoDeRechazo.listaNegra),
        ('VIVIENDA_INACTIVA', MotivoDeRechazo.viviendaInactiva),
        ('SIN_NIVEL_DE_ACCESO', MotivoDeRechazo.sinNivelDeAcceso),
        ('PLACA_DUPLICADA', MotivoDeRechazo.placaDuplicada),
      ]) {
        final (repo, _) = await montar(
          (_, _) => json(
            200,
            generada(
              creada: false,
              id: null,
              motivo: texto,
              explicacion: 'El dominio escribe este texto.',
            ),
          ),
        );
        final r = await repo.crearVisita(visitaDePrueba('k-000003'));
        expect(r, isA<VisitaRechazada>(), reason: texto);
        expect((r as VisitaRechazada).motivo, esperado);
        expect(r.explicacion, 'El dominio escribe este texto.');
      }
    });

    test('UN MOTIVO DESCONOCIDO NO se toma por creada', () async {
      // Es la dirección segura de §2.1.4: una versión nueva del servidor con un
      // motivo que esta app no conoce tiene que seguir siendo un rechazo. Lo
      // contrario diría «visita autorizada» sobre algo que el conjunto negó.
      final (repo, _) = await montar(
        (_, _) => json(
          200,
          generada(creada: false, id: null, motivo: 'MOTIVO_DEL_FUTURO', explicacion: 'No.'),
        ),
      );
      expect(await repo.crearVisita(visitaDePrueba('k-000004')), isA<VisitaRechazada>());
    });

    test('un 422 es un formulario que el servidor no admite, y no se confunde con un 500', () async {
      final (repo, _) = await montar(
        (_, _) => json(422, {'mensaje': 'Falta confirmar que el visitante autorizó el uso de su foto'}),
      );
      await expectLater(
        repo.crearVisita(visitaDePrueba('k-000005')),
        throwsA(
          isA<Fallo>()
              .having((f) => f.clase, 'clase', ClaseDeFallo.datosNoValidos)
              .having((f) => f.detalle, 'detalle', contains('autorizó')),
        ),
      );
    });
  });

  group('F6 · últimos visitantes y volver a autorizar', () {
    test('los últimos visitantes se traducen uno a uno', () async {
      final (repo, servidor) = await montar(
        (_, _) => json(200, [
          {
            'autorizacionId': 'aut-7',
            'visitante': 'Plomero Pérez',
            'documento': '79000111',
            'ultimaVisita': '2026-09-12T15:00:00.000Z',
            'placa': null,
            'tieneFoto': true,
          },
        ]),
      );
      final l = await repo.ultimosVisitantes();
      expect(servidor.peticiones.single.path, '/copropiedades/cop-1/mi/visitas/ultimas');
      expect(l.single.autorizacionId, 'aut-7');
      expect(l.single.placa, isNull);
      expect(l.single.tieneFoto, isTrue);
      expect(l.single.ultimaVisita.toUtc().hour, 15);
    });

    test('volver a autorizar lleva la visita EN LA RUTA y sólo cuándo, cuánto y la casilla',
        () async {
      final (repo, servidor) = await montar((_, _) => json(200, generada(id: 'a-9')));
      final r = await repo.volverAAutorizar(
        autorizacionId: 'aut-7',
        inicio: DateTime.utc(2026, 9, 27, 13),
        duracionMinutos: 60,
        casillaMarcada: true,
        claveDeIdempotencia: 'k-000006',
      );

      expect(servidor.peticiones.single.path, '/copropiedades/cop-1/mi/visitas/aut-7/repeticion');
      final cuerpo = cuerpoEnviado(servidor);
      // Nada de nombre, documento, placa ni foto: los copia el servidor.
      expect(cuerpo.keys.toSet(), {'inicio', 'duracionMinutos', 'casillaMarcada', 'claveDeIdempotencia'});
      expect(cuerpo['inicio'], '2026-09-27T13:00:00.000Z');
      expect(cuerpo['duracionMinutos'], 60);
      expect((r as VisitaCreada).id, 'a-9');
    });

    test('una visita que no es de su vivienda (404) se dice con el motivo del servidor', () async {
      final (repo, _) = await montar(
        (_, _) => json(404, {'mensaje': 'Esa visita no es de su vivienda'}),
      );
      await expectLater(
        repo.volverAAutorizar(
          autorizacionId: 'ajena',
          inicio: DateTime.utc(2026, 9, 27, 13),
          duracionMinutos: 60,
          casillaMarcada: true,
          claveDeIdempotencia: 'k-000007',
        ),
        throwsA(isA<Fallo>().having((f) => f.detalle, 'detalle', 'Esa visita no es de su vivienda')),
      );
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
}
