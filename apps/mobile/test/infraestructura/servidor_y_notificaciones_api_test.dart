import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/direccion_del_servidor.dart';
import 'package:ncr_residente/dominio/notificaciones.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/infraestructura/api/comprobador_de_salud.dart';
import 'package:ncr_residente/infraestructura/api/generado/clients/residente_api.dart';
import 'package:ncr_residente/infraestructura/api/notificaciones_api.dart';
import 'package:ncr_residente/infraestructura/api/soporte_de_api.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';

import '../dobles/servidor_falso.dart';
import 'repositorio_api_test.dart' show AutenticadorDePrueba, RelojFijo;

ResponseBody texto(int codigo, String cuerpo) => ResponseBody.fromString(
      cuerpo,
      codigo,
      headers: {
        Headers.contentTypeHeader: ['text/html'],
      },
    );

DioException fallo(DioExceptionType tipo, {Object? error, String? mensaje}) => DioException(
      requestOptions: RequestOptions(baseUrl: 'http://mac.local:3000'),
      type: tipo,
      error: error,
      message: mensaje,
    );

void main() {
  group('la prueba de /health antes de guardar una dirección', () {
    Future<(SaludDelServidor, ServidorFalso)> probar(ResponseBody Function(RequestOptions) r) async {
      final servidor = ServidorFalso(r);
      final salud = await ComprobadorPorHttp(adaptador: servidor).comprobar('http://mac.local:3000');
      return (salud, servidor);
    }

    test('200 con {"estado":"vivo"} es Next Control, y se pidió SIN token', () async {
      final (salud, servidor) = await probar(
        (_) => json(200, {'estado': 'vivo', 'momento': '2026-09-20T12:00:00.000Z'}),
      );
      expect(salud, SaludDelServidor.responde);
      final p = servidor.peticiones.single;
      expect('${p.baseUrl}${p.path}', 'http://mac.local:3000/health');
      expect(p.headers['Authorization'], isNull);
    });

    test('otra cosa en ese puerto NO lo es: otro código, otro cuerpo, HTML', () async {
      for (final r in [
        json(404, {'message': 'Cannot GET /health'}),
        json(200, {'status': 'ok'}),
        json(200, {'estado': 'muerto', 'momento': '2026-09-20T12:00:00.000Z'}),
        texto(200, '<html>portal cautivo</html>'),
        texto(302, ''),
      ]) {
        final (salud, _) = await probar((_) => r);
        expect(salud, SaludDelServidor.noEsNextControl);
      }
    });

    test('un fallo de transporte se traduce en la causa que se puede arreglar', () async {
      final (salud, _) = await probar(
        (o) => throw fallo(DioExceptionType.connectionError, error: 'Connection refused'),
      );
      expect(salud, SaludDelServidor.rechazaConexion);
    });

    test('cada tipo de fallo tiene su nombre', () {
      expect(saludDeFallo(fallo(DioExceptionType.connectionTimeout)), SaludDelServidor.tiempoAgotado);
      expect(saludDeFallo(fallo(DioExceptionType.receiveTimeout)), SaludDelServidor.tiempoAgotado);
      expect(saludDeFallo(fallo(DioExceptionType.badCertificate)), SaludDelServidor.certificadoInvalido);
      expect(saludDeFallo(fallo(DioExceptionType.badResponse)), SaludDelServidor.noEsNextControl);
      expect(saludDeFallo(fallo(DioExceptionType.cancel)), SaludDelServidor.sinRespuesta);
      expect(
        saludDeFallo(fallo(DioExceptionType.connectionError, error: 'HandshakeException: CERTIFICATE_VERIFY_FAILED')),
        SaludDelServidor.certificadoInvalido,
      );
      // Un .local que la red no resuelve: el nombre no se encuentra.
      expect(
        saludDeFallo(fallo(
          DioExceptionType.connectionError,
          error: const SocketException("Failed host lookup: 'mac.local'"),
        )),
        SaludDelServidor.nombreDesconocido,
      );
      expect(
        saludDeFallo(fallo(DioExceptionType.connectionError, error: 'No route to host')),
        SaludDelServidor.redLocalDenegada,
      );
      expect(
        saludDeFallo(fallo(DioExceptionType.unknown, error: 'algo raro')),
        SaludDelServidor.sinRespuesta,
      );
    });
  });

  test('los Dio que hablan con la API SIGUEN la dirección', () {
    final direccion = ValueNotifier('http://mac.local:3000');
    final a = Dio();
    final b = Dio();
    seguirLaDireccion(direccion, [a, b]);
    expect([a.options.baseUrl, b.options.baseUrl], ['http://mac.local:3000', 'http://mac.local:3000']);
    direccion.value = 'http://oficina.local:3000';
    expect([a.options.baseUrl, b.options.baseUrl], ['http://oficina.local:3000', 'http://oficina.local:3000']);
  });

  test('sin conexión, el residente lee la causa en español y con la dirección', () {
    final f = falloDeDio(
      fallo(DioExceptionType.connectionError, error: const SocketException("Failed host lookup: 'mac.local'")),
    );
    expect(f.clase, ClaseDeFallo.sinConexion);
    expect(f.detalle, contains('Cambiar servidor'));
    expect(f.detalle, contains('http://mac.local:3000'));
    expect(f.detalle, isNot(contains('connection')));
  });

  group('las notificaciones de la API', () {
    Future<(NotificacionesPorApi, ServidorFalso)> montar(ResponseBody Function(RequestOptions) r) async {
      final sesion = SesionEnUso(
        almacen: AlmacenEnMemoria(),
        autenticador: AutenticadorDePrueba(),
        reloj: const RelojFijo(),
      );
      await sesion.iniciar(identificador: PorCorreo('x@y.invalid'), clave: 'z');
      final servidor = ServidorFalso(r);
      final dio = Dio(BaseOptions(baseUrl: 'http://api.invalid'))..httpClientAdapter = servidor;
      return (NotificacionesPorApi(api: ResidenteApi(dio), sesion: sesion), servidor);
    }

    test('se piden de MI copropiedad y se traducen, tipo por tipo', () async {
      final (repo, servidor) = await montar(
        (_) => json(200, [
          {
            'id': 'n-1',
            'tipo': 'visita_rechazada',
            'en': '2026-09-20T14:00:00.000Z',
            'visitante': 'Ana',
            'motivo': 'El residente no la espera',
            'autorizacionId': 'aut-1',
          },
          {
            'id': 'n-2',
            'tipo': 'ingreso_de_visitante',
            'en': '2026-09-20T15:00:00.000Z',
            'visitante': 'Luis',
            'motivo': null,
            'autorizacionId': null,
          },
          {
            'id': 'n-3',
            'tipo': 'tipo_del_futuro',
            'en': '2026-09-20T16:00:00.000Z',
            'visitante': null,
            'motivo': null,
            'autorizacionId': null,
          },
        ]),
      );
      final l = await repo.misNotificaciones();
      expect(servidor.peticiones.single.path, '/copropiedades/cop-1/mi/notificaciones');
      expect(l.map((n) => n.tipo), [
        TipoDeNotificacion.visitaRechazada,
        TipoDeNotificacion.ingresoDeVisitante,
        TipoDeNotificacion.otra,
      ]);
      expect(l.first.texto, 'Rechazaron la visita de Ana: El residente no la espera');
      expect(l.first.autorizacionId, 'aut-1');
      expect(l.first.en.toUtc().hour, 14);
    });

    test('un fallo de la API llega tipado, no como DioException', () async {
      final (repo, _) = await montar((_) => json(403, {'mensaje': 'otra copropiedad'}));
      await expectLater(
        repo.misNotificaciones(),
        throwsA(isA<Fallo>().having((f) => f.clase, 'clase', ClaseDeFallo.sinPermiso)),
      );
    });
  });
}
