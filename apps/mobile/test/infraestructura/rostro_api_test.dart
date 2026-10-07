/// 15-X (D2) · «Mi rostro» contra el contrato GENERADO: las tres rutas, el
/// cuerpo del registro —sin persona, con la versión que se mostró y la
/// aceptación— y los rechazos del servidor como `Fallo` con su texto.
library;

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/rostro.dart';
import 'package:ncr_residente/dominio/rostro_de_menor.dart';
import 'package:ncr_residente/infraestructura/api/generado/clients/residente_api.dart';
import 'package:ncr_residente/infraestructura/api/rostro_api.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';

import '../dobles/servidor_falso.dart';
import '../dobles/visitas.dart';
import 'hogar_15w_api_test.dart' show AutenticadorFijo, RelojDePrueba;

Map<String, Object?> estado(String e, {bool conPolitica = false}) => {
  'estado': e,
  'calidad': 0.9,
  'registradoEn': '2026-10-08T12:00:00.000Z',
  'venceEn': '2027-10-08T12:00:00.000Z',
  'diasParaVencer': 365,
  'equiposConRostro': 2,
  'equiposConMiRostro': 1,
  'equipos': [
    {'nombre': 'Terminal', 'estado': 'sincronizada'},
    {'nombre': 'Videoportero', 'estado': 'lo_que_venga'},
  ],
  if (conPolitica) 'politica': {'version': 'rostro-v1', 'texto': 'Autorizo…'},
};

void main() {
  late ServidorFalso servidor;

  Future<(ResidenteApi, SesionEnUso)> cliente(
    ResponseBody Function(RequestOptions) responder,
  ) async {
    servidor = ServidorFalso(responder);
    final dio = Dio(BaseOptions(baseUrl: 'http://api.invalid'))..httpClientAdapter = servidor;
    final sesion = SesionEnUso(
      almacen: AlmacenEnMemoria(),
      autenticador: AutenticadorFijo(),
      reloj: RelojDePrueba(),
    );
    await sesion.iniciar(
      identificador: const PorUsuario(codigo: 'MIRA', usuario: 'a'),
      clave: 'x',
    );
    return (ResidenteApi(dio), sesion);
  }

  Future<RostroPorApi> rostro(ResponseBody Function(RequestOptions) responder) async {
    final (api, sesion) = await cliente(responder);
    return RostroPorApi(api: api, sesion: sesion);
  }

  Future<RostroDeMenores> deMenores(ResponseBody Function(RequestOptions) responder) async {
    final (api, sesion) = await cliente(responder);
    return RostroDeMenoresPorApi(api: api, sesion: sesion);
  }

  test('lee el estado con la política; un estado de equipo desconocido es «pendiente»', () async {
    final r = await rostro((_) => json(200, estado('parcial', conPolitica: true)));
    final e = await r.miRostro();
    expect(servidor.peticiones.single.path, '/copropiedades/cop-1/mi/rostro');
    expect(e.estado, EstadoDelRostro.parcial);
    expect(e.politica?.version, 'rostro-v1');
    expect(e.equipos.map((q) => q.estado), [EstadoEnEquipo.sincronizada, EstadoEnEquipo.pendiente]);
    expect(e.diasParaVencer, 365);
  });

  test('registra sin persona, con la versión que se mostró y la aceptación en true', () async {
    final r = await rostro((_) => json(201, estado('activa')));
    final e = await r.registrar(fotoDeVisita(), versionPolitica: 'rostro-v1');
    expect(servidor.peticiones.single.method, 'POST');
    final cuerpo = servidor.cuerpo(0);
    expect(cuerpo['versionPolitica'], 'rostro-v1');
    expect(cuerpo['aceptaPolitica'], isTrue);
    expect(cuerpo['tipoMime'], 'image/jpeg');
    expect(cuerpo.keys, isNot(contains('personaId')));
    expect(cuerpo.keys, isNot(contains('titularId')));
    expect(e.estado, EstadoDelRostro.activa);
    expect(e.politica, isNull, reason: 'la política la trae la lectura, no el registro');
  });

  test('retira por su ruta', () async {
    final r = await rostro((_) => json(200, estado('en_retiro')));
    final e = await r.retirar();
    expect(servidor.peticiones.single.path, '/copropiedades/cop-1/mi/rostro/retiro');
    expect(e.tieneRostro, isFalse);
  });

  test('la política que cambió (409) llega como Fallo con el texto del servidor', () async {
    final r = await rostro(
      (_) => json(409, {
        'estado': 409,
        'correlacion': 'c',
        'mensaje': 'La política del rostro cambió: léala y acéptela de nuevo',
      }),
    );
    await expectLater(
      r.registrar(fotoDeVisita(), versionPolitica: 'vieja'),
      throwsA(
        isA<Fallo>()
            .having((f) => f.clase, 'clase', ClaseDeFallo.servidor)
            .having((f) => f.detalle, 'detalle', contains('política del rostro cambió')),
      ),
    );
  });

  group('D3 · el rostro de un menor de mi hogar', () {
    test('lee por SU residente, con la política del representante', () async {
      final r = await deMenores((_) => json(200, estado('sin_rostro', conPolitica: true)));
      final e = await r.de('r-3').miRostro();
      expect(servidor.peticiones.single.path, '/copropiedades/cop-1/mi/menores/r-3/rostro');
      expect(e.politica?.version, 'rostro-v1');
    });

    test('registra con las dos declaraciones en true, sin persona ni titular', () async {
      final r = await deMenores((_) => json(201, estado('activa')));
      await r.de('r-3').registrar(fotoDeVisita(), versionPolitica: 'rostro-menor-v1');
      final p = servidor.peticiones.single;
      expect((p.method, p.path), ('POST', '/copropiedades/cop-1/mi/menores/r-3/rostro'));
      final cuerpo = servidor.cuerpo(0);
      expect(cuerpo['versionPolitica'], 'rostro-menor-v1');
      expect(cuerpo['aceptaPolitica'], isTrue);
      expect(cuerpo['declaraRepresentacionLegal'], isTrue);
      expect(cuerpo['menorInformadoYDeAcuerdo'], isTrue);
      expect(cuerpo.keys, isNot(anyOf(contains('personaId'), contains('titularId'))));
    });

    test('retira por su ruta; un 403 llega como Fallo con el texto del servidor', () async {
      final r = await deMenores((_) => json(200, estado('en_retiro')));
      await r.de('r-9').retirar();
      expect(servidor.peticiones.single.path, '/copropiedades/cop-1/mi/menores/r-9/rostro/retiro');
      final negado = await deMenores(
        (_) => json(403, {
          'estado': 403,
          'correlacion': 'c',
          'mensaje': 'Sólo el titular del hogar gestiona el rostro de un menor',
        }),
      );
      await expectLater(
        negado.de('r-3').miRostro(),
        throwsA(isA<Fallo>().having((f) => f.detalle, 'detalle', contains('titular del hogar'))),
      );
    });
  });
}
