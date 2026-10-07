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

  Future<RostroPorApi> rostro(ResponseBody Function(RequestOptions) responder) async {
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
    return RostroPorApi(api: ResidenteApi(dio), sesion: sesion);
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
}
