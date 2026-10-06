import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/edad.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/registro.dart';
import 'package:ncr_residente/infraestructura/api/cuerpo_de_error.dart';
import 'package:ncr_residente/infraestructura/api/generado/clients/cuentas_api.dart';
import 'package:ncr_residente/infraestructura/api/registro_api.dart';

import '../dobles/servidor_falso.dart';

/// Una contraseña de prueba que cumple la política (no es un secreto).
const claveDePrueba = 'Clave#2026';

/// RONDA 15-W · «Crear cuenta» contra el contrato GENERADO: la política llega
/// dentro del sobre de error (`mensaje.politica`), cada 400 se traduce a lo
/// que la pantalla sabe pintar, y el código equivocado conserva el texto
/// genérico del servidor sin añadirle nada.
const politica = {'version': 'v-1', 'texto': 'Autorizo el tratamiento de mis datos.'};

/// El sobre del filtro global, con la carga dentro de `mensaje`.
Map<String, Object?> sobre(int estado, Object mensaje) => {
  'estado': estado,
  'correlacion': 'c-1',
  'mensaje': mensaje,
};

ResponseBody conEspera(int segundos) => ResponseBody.fromString(
  jsonEncode(sobre(429, 'Too Many Requests')),
  429,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
    'retry-after': ['$segundos'],
  },
);

const solicitud = SolicitudDeRegistro(
  usuario: ' ana.perez ',
  correo: 'ana@ejemplo.invalid ',
  contrasena: claveDePrueba,
  confirmacion: claveDePrueba,
  codigoDeInvitacion: ' MIRA-K7PQ-2XWZ ',
  fechaNacimiento: '1990-05-17',
  versionPolitica: 'v-1',
);

void main() {
  late ServidorFalso servidor;

  RegistroPorApi montar(ResponseBody Function(RequestOptions) responder) {
    servidor = ServidorFalso(responder);
    final dio = Dio(BaseOptions(baseUrl: 'http://api.invalid'))..httpClientAdapter = servidor;
    return RegistroPorApi(api: CuentasApi(dio));
  }

  test('la política se pide con el formulario VACÍO y se lee del sobre del 400', () async {
    final r = montar(
      (_) => json(
        400,
        sobre(400, {
          'message': ['usuario must be longer than or equal to 3 characters'],
          'error': 'Bad Request',
          'statusCode': 400,
          'politica': politica,
        }),
      ),
    );
    final p = await r.politicaVigente();
    expect((p.version, p.texto), ('v-1', 'Autorizo el tratamiento de mis datos.'));
    expect(servidor.peticiones.single.path, '/auth/registro');
    expect(servidor.cuerpo(0), {
      'usuario': '',
      'correo': '',
      'contrasena': '',
      'confirmacion': '',
      'codigoDeInvitacion': '',
      'fechaNacimiento': '',
      'aceptaTratamientoDeDatos': false,
      'versionPolitica': '',
    });
  });

  test(
    'sin política en el rechazo, o con el limitador, no hay política: un fallo con palabras',
    () async {
      final sinPolitica = montar((_) => json(400, sobre(400, {'message': 'Bad Request'})));
      await expectLater(
        sinPolitica.politicaVigente(),
        throwsA(isA<Fallo>().having((f) => f.clase, 'clase', ClaseDeFallo.datosNoValidos)),
      );
      final limitado = montar((_) => conEspera(540));
      await expectLater(
        limitado.politicaVigente(),
        throwsA(isA<Fallo>().having((f) => f.detalle, 'detalle', contains('Espere 9 minutos'))),
      );
    },
  );

  test('201: creada, con la casilla aceptada y la versión que se mostró', () async {
    final r = montar((_) => json(201, {'creada': true}));
    expect(await r.registrar(solicitud), isA<CuentaCreada>());
    final c = servidor.cuerpo(0);
    expect(c['aceptaTratamientoDeDatos'], isTrue);
    expect(c['versionPolitica'], 'v-1');
    expect(
      (c['usuario'], c['correo'], c['codigoDeInvitacion']),
      ('ana.perez', 'ana@ejemplo.invalid', 'MIRA-K7PQ-2XWZ'),
    );
  });

  test('400 con campos: por nombre, y con la política vigente', () async {
    final r = montar(
      (_) => json(
        400,
        sobre(400, {
          'mensaje': 'Revise los datos',
          'campos': [
            {'campo': 'confirmacion', 'motivo': 'Las contraseñas no coinciden'},
            {'campo': 'versionPolitica', 'motivo': 'La política cambió'},
          ],
          'politica': {'version': 'v-2', 'texto': 'La nueva.'},
        }),
      ),
    );
    final e = await r.registrar(solicitud) as RegistroConErrores;
    expect(e.campos, {
      'confirmacion': 'Las contraseñas no coinciden',
      'versionPolitica': 'La política cambió',
    });
    expect(e.politica?.version, 'v-2');
  });

  test('400 del menor y del código: el texto del servidor, tal cual', () async {
    var n = 0;
    final r = montar((_) {
      n += 1;
      return json(
        400,
        sobre(400, {
          'message': n == 1
              ? mensajeCuentaDeMenor
              : 'El código de invitación no es válido o ya se usó',
          'error': 'Bad Request',
          'statusCode': 400,
          'politica': politica,
        }),
      );
    });
    final menor = await r.registrar(solicitud) as RegistroRechazado;
    expect(menor.mensaje, mensajeCuentaDeMenor);
    expect(menor.politica?.version, 'v-1');
    final codigo = await r.registrar(solicitud) as RegistroRechazado;
    expect(codigo.mensaje, 'El código de invitación no es válido o ya se usó');
  });

  test('409 y 429: rechazos con su texto; 503 y sin red, fallos', () async {
    var n = 0;
    final r = montar((o) {
      n += 1;
      return switch (n) {
        1 => json(
          409,
          sobre(409, {'message': 'Ese usuario no está disponible', 'statusCode': 409}),
        ),
        2 => conEspera(30),
        3 => json(503, sobre(503, {'message': 'El registro no está disponible en este momento'})),
        _ => throw DioException(requestOptions: o, type: DioExceptionType.connectionError),
      };
    });
    expect(
      (await r.registrar(solicitud) as RegistroRechazado).mensaje,
      'Ese usuario no está disponible',
    );
    expect(
      (await r.registrar(solicitud) as RegistroRechazado).mensaje,
      contains('Espere un minuto'),
    );
    await expectLater(
      r.registrar(solicitud),
      throwsA(isA<Fallo>().having((f) => f.detalle, 'detalle', contains('no está disponible'))),
    );
    await expectLater(
      r.registrar(solicitud),
      throwsA(isA<Fallo>().having((f) => f.clase, 'clase', ClaseDeFallo.sinConexion)),
    );
  });

  group('el cuerpo del rechazo', () {
    test('los campos y la política se leen dentro del sobre o fuera de él', () {
      expect(
        camposDelRechazo({
          'campos': [
            {'campo': 'a', 'motivo': 'b'},
          ],
        }),
        {'a': 'b'},
      );
      expect(camposDelRechazo('texto'), isEmpty);
      expect(camposDelRechazo(sobre(400, 'texto')), isEmpty);
      expect(politicaDelRechazo({'politica': politica})?.version, 'v-1');
      expect(
        politicaDelRechazo(
          sobre(400, {
            'politica': {'version': '', 'texto': 'x'},
          }),
        ),
        isNull,
      );
    });

    test('la espera se dice en minutos, y sin plazo, en palabras', () {
      expect(mensajeDeEspera(null), contains('Espere unos minutos'));
      expect(mensajeDeEspera(60), contains('Espere un minuto'));
      expect(mensajeDeEspera(61), contains('Espere 2 minutos'));
    });
  });
}
