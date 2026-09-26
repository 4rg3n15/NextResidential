import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/api/generado/clients/cuentas_api.dart';
import 'package:ncr_residente/infraestructura/sesion/autenticador_por_api.dart';

import '../dobles/servidor_falso.dart';

/// D1 · la app entra por `POST /auth/acceso` con código y usuario, y renueva
/// contra el proveedor. Lo que hay que demostrar: que el correo sintético no
/// viaja NI se enseña, y que un fallo no dice qué parte estaba mal.
class RenovacionQueCuenta implements Autenticador {
  int renovaciones = 0;
  @override
  Future<Sesion> iniciarSesion(IdentificadorDeAcceso i, {required String clave}) =>
      throw UnimplementedError('la renovación no inicia sesiones');
  @override
  Future<Sesion> renovar(Sesion sesion) async {
    renovaciones += 1;
    return sesion;
  }
}

void main() {
  final expira = DateTime.utc(2026, 9, 26, 12, 5);
  String token({bool cambio = false, String correo = 'casa42.ana@cop-1.usuarios.ncr.invalid'}) =>
      jwtCon({
        'sub': 'auth-1',
        'usuario_id': 'usr-1',
        'copropiedad_id': 'cop-1',
        'email': correo,
        'debe_cambiar_contrasena': cambio,
        'exp': expira.millisecondsSinceEpoch ~/ 1000,
      });

  (AutenticadorPorApi, ServidorFalso, RenovacionQueCuenta) montar(
    ResponseBody Function(RequestOptions) responder,
  ) {
    final servidor = ServidorFalso(responder);
    final dio = Dio(BaseOptions(baseUrl: 'http://api.invalid'))..httpClientAdapter = servidor;
    final renovacion = RenovacionQueCuenta();
    return (AutenticadorPorApi(api: CuentasApi(dio), renovacion: renovacion), servidor, renovacion);
  }

  ResponseBody ok({bool cambio = false, String? correo}) => json(200, {
        'accessToken': correo == null ? token(cambio: cambio) : token(cambio: cambio, correo: correo),
        'refreshToken': 'refresco-1',
        'expiraEn': 300,
        'debeCambiarContrasena': cambio,
      });

  test('con código y usuario envía EXACTAMENTE eso, sin correo', () async {
    final (a, servidor, _) = montar((_) => ok());
    final s = await a.iniciarSesion(
      const PorUsuario(codigo: 'MIRA', usuario: 'casa42.ana'),
      clave: 'Clave#2026',
    );

    expect(servidor.peticiones.single.path, '/auth/acceso');
    final cuerpo = servidor.cuerpo(0);
    expect(cuerpo['codigo'], 'MIRA');
    expect(cuerpo['usuario'], 'casa42.ana');
    // El cliente generado serializa los opcionales como null: sin valor.
    expect(cuerpo['correo'], isNull);
    expect(s.copropiedadId, 'cop-1');
    expect(s.expiraEn, expira);
    // C-36 · el sintético viaja en el token, pero la sesión no lo guarda.
    expect(s.correo, isEmpty);
  });

  test('la cuenta anterior entra con su correo, que sí se conserva', () async {
    final (a, servidor, _) = montar((_) => ok(correo: 'ana@ejemplo.invalid'));
    final s = await a.iniciarSesion(const PorCorreo('ana@ejemplo.invalid'), clave: 'x');
    expect(servidor.cuerpo(0)['correo'], 'ana@ejemplo.invalid');
    expect(s.correo, 'ana@ejemplo.invalid');
  });

  test('ADR-023 · el cambio pendiente llega a la sesión', () async {
    final (a, _, _) = montar((_) => ok(cambio: true));
    final s = await a.iniciarSesion(
      const PorUsuario(codigo: 'MIRA', usuario: 'casa42.ana'),
      clave: 'Inicial#2026',
    );
    expect(s.debeCambiarContrasena, isTrue);
  });

  test('un rechazo NO dice qué parte falló: código, usuario o contraseña', () async {
    final (a, _, _) = montar((_) => json(401, {'mensaje': 'Credenciales inválidas'}));
    await expectLater(
      a.iniciarSesion(const PorUsuario(codigo: 'NOEXISTE', usuario: 'x'), clave: 'y'),
      throwsA(
        isA<Fallo>()
            .having((f) => f.clase, 'clase', ClaseDeFallo.sesionInvalida)
            .having((f) => f.detalle, 'detalle', 'Código, usuario o contraseña incorrectos'),
      ),
    );
  });

  test('429 dice que espere; sin red dice sin conexión, no «incorrecto»', () async {
    final (a, _, _) = montar((_) => json(429, {'mensaje': 'demasiadas'}));
    await expectLater(
      a.iniciarSesion(const PorUsuario(codigo: 'MIRA', usuario: 'x'), clave: 'y'),
      throwsA(isA<Fallo>().having((f) => f.detalle, 'detalle', contains('Demasiados intentos'))),
    );

    final (b, _, _) = montar(
      (o) => throw DioException(requestOptions: o, type: DioExceptionType.connectionError),
    );
    await expectLater(
      b.iniciarSesion(const PorUsuario(codigo: 'MIRA', usuario: 'x'), clave: 'y'),
      throwsA(isA<Fallo>().having((f) => f.clase, 'clase', ClaseDeFallo.sinConexion)),
    );
  });

  test('403 se pasa con el mensaje del servidor; la renovación va al proveedor', () async {
    final (a, _, renovacion) = montar((_) => json(403, {'mensaje': 'Cuenta desactivada'}));
    await expectLater(
      a.iniciarSesion(const PorUsuario(codigo: 'MIRA', usuario: 'x'), clave: 'y'),
      throwsA(isA<Fallo>().having((f) => f.detalle, 'detalle', 'Cuenta desactivada')),
    );
    final s = Sesion(
      tokenDeAcceso: 'a',
      tokenDeRefresco: 'r',
      expiraEn: expira,
      usuarioId: 'u',
      copropiedadId: 'c',
      correo: '',
    );
    await a.renovar(s);
    expect(renovacion.renovaciones, 1);
  });
}
