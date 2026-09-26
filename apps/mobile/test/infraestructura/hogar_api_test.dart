import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/hogar.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/api/generado/clients/cuentas_api.dart';
import 'package:ncr_residente/infraestructura/api/generado/clients/residente_api.dart';
import 'package:ncr_residente/infraestructura/api/hogar_api.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';

import '../dobles/servidor_falso.dart';

/// Los adaptadores del hogar (15-I): que traducen el contrato GENERADO a las
/// entidades del dominio, que la copropiedad sale de la sesión, y que un motivo
/// desconocido nunca se pinta como éxito.
class AutenticadorFijo implements Autenticador {
  @override
  Future<Sesion> iniciarSesion(IdentificadorDeAcceso i, {required String clave}) async => Sesion(
        tokenDeAcceso: 't',
        tokenDeRefresco: 'r',
        expiraEn: DateTime.now().toUtc().add(const Duration(minutes: 5)),
        usuarioId: 'u',
        copropiedadId: 'cop-1',
        correo: '',
      );
  @override
  Future<Sesion> renovar(Sesion sesion) async => sesion;
}

class RelojDelSistemaDePrueba implements Reloj {
  @override
  DateTime ahora() => DateTime.now().toUtc();
}

void main() {
  late ServidorFalso servidor;
  late SesionEnUso sesion;

  Future<(AltaPorApi, HogarPorApi, CuentaPorApi)> montar(
    ResponseBody Function(RequestOptions) responder,
  ) async {
    sesion = SesionEnUso(
      almacen: AlmacenEnMemoria(),
      autenticador: AutenticadorFijo(),
      reloj: RelojDelSistemaDePrueba(),
    );
    await sesion.iniciar(identificador: const PorUsuario(codigo: 'MIRA', usuario: 'a'), clave: 'x');
    servidor = ServidorFalso(responder);
    final dio = Dio(BaseOptions(baseUrl: 'http://api.invalid'))..httpClientAdapter = servidor;
    final api = ResidenteApi(dio);
    return (
      AltaPorApi(api: api, sesion: sesion),
      HogarPorApi(api: api, sesion: sesion),
      CuentaPorApi(api: CuentasApi(dio)),
    );
  }

  const perfilJson = {
    'nombres': 'Ana',
    'apellidos': 'Pérez',
    'nombreCompleto': 'Ana Pérez',
    'fechaNacimiento': null,
    'tipoDocumento': 'cedula',
    'numeroDocumento': '1000000001',
    'correo': 'ana@ejemplo.invalid',
    'telefono': '+573000000001',
    'copropiedadNombre': 'Conjunto',
    'copropiedadDireccion': 'Calle 1',
    'telefonoPorteria': null,
  };

  const datos = DatosDePerfil(
    nombres: 'Ana',
    apellidos: 'Pérez',
    fechaNacimiento: null,
    tipoDocumento: 'cedula',
    numeroDocumento: '1000000001',
    correo: 'ana@ejemplo.invalid',
    telefono: '+573000000001',
  );

  test('3.2 · el estado del alta llega con las etiquetas de la copropiedad', () async {
    final (alta, _, _) = await montar((_) => json(200, {
          'completa': false,
          'viviendaVinculada': false,
          'debeDeclararOcupantes': false,
          'vocabulario': {
            'copropiedadNombre': 'Torres del Parque',
            'tipo': 'apartamentos',
            'etiquetaVivienda': 'Apartamento',
            'etiquetaAgrupacion': 'Torre',
          },
          'pideAgrupacion': true,
          'avisoOcupantes': 'DEFINITIVO',
        }));
    final e = await alta.miAlta();
    expect(servidor.peticiones.single.path, '/copropiedades/cop-1/mi/alta');
    expect(e.vocabulario.etiquetaAgrupacion, 'Torre');
    expect(e.pideAgrupacion, isTrue);
    expect(e.avisoOcupantes, 'DEFINITIVO');
  });

  test('3.2 · «no lo tengo» viaja como código nulo; el cambio va a /mi/vinculacion', () async {
    final (alta, _, _) = await montar((_) => json(200, {
          'vinculada': true,
          'debeDeclararOcupantes': true,
          'motivo': null,
          'explicacion': null,
          'campos': [],
        }));
    final r = await alta.completarAlta(
      const SolicitudDeAlta(perfil: datos, identificador: '42', agrupacion: null, codigo: null),
    );
    expect(r, isA<AltaHecha>());
    expect((r as AltaHecha).debeDeclararOcupantes, isTrue);
    expect(servidor.cuerpo(0)['codigo'], isNull);
    expect(servidor.peticiones[0].path, endsWith('/mi/alta'));

    await alta.completarAlta(
      const SolicitudDeAlta(perfil: datos, identificador: '7', agrupacion: 'B', codigo: 'ABCDEFGH'),
      cambio: true,
    );
    expect(servidor.peticiones[1].path, endsWith('/mi/vinculacion'));
    expect(servidor.cuerpo(1)['codigo'], 'ABCDEFGH');
  });

  test('3.2 · rechazo con explicación y rechazo por campos se distinguen', () async {
    var n = 0;
    final (alta, _, _) = await montar((_) {
      n += 1;
      return n == 1
          ? json(200, {
              'vinculada': false,
              'debeDeclararOcupantes': false,
              'motivo': 'CODIGO_INCORRECTO',
              'explicacion': 'El código no corresponde.',
              'campos': [],
            })
          : json(200, {
              'vinculada': false,
              'debeDeclararOcupantes': false,
              'motivo': null,
              'explicacion': null,
              'campos': [
                {'campo': 'telefono', 'motivo': 'El teléfono tiene de 7 a 15 cifras'},
              ],
            });
    });
    final s = const SolicitudDeAlta(perfil: datos, identificador: '42', agrupacion: null, codigo: 'X');
    final a = await alta.completarAlta(s);
    expect(a, isA<AltaRechazada>().having((r) => r.motivo, 'motivo', 'CODIGO_INCORRECTO'));
    final b = await alta.completarAlta(s);
    expect((b as AltaConErrores).campos['telefono'], contains('7 a 15'));
  });

  test('D6 · la declaración envía la confirmación; un 403 es sinPermiso', () async {
    var n = 0;
    final (alta, _, _) = await montar((_) {
      n += 1;
      return n == 1
          ? json(200, {
              'declarados': 3,
              'declarada': true,
              'aviso': 'DEFINITIVO',
              'plazas': [
                {'id': 'p1', 'numero': 1, 'libre': false, 'codigo': null, 'ocupante': 'Ana'},
                {'id': 'p2', 'numero': 2, 'libre': true, 'codigo': 'ABCD-EFGH', 'ocupante': null},
              ],
            })
          : json(403, {'mensaje': 'El número de ocupantes ya está fijado'});
    });
    final o = await alta.declararOcupantes(3);
    expect(servidor.cuerpo(0), {'numero': 3, 'confirmoQueEsDefinitivo': true});
    expect(o.libres.single.codigo, 'ABCD-EFGH');
    await expectLater(
      alta.declararOcupantes(4),
      throwsA(isA<Fallo>().having((f) => f.clase, 'clase', ClaseDeFallo.sinPermiso)),
    );
  });

  test('3.5 · perfil: lectura, guardado y documento en uso', () async {
    var n = 0;
    final (_, hogar, _) = await montar((o) {
      n += 1;
      if (o.method == 'GET') return json(200, perfilJson);
      return n == 2
          ? json(200, {'guardado': true, 'perfil': perfilJson, 'motivo': null, 'campos': []})
          : json(200, {'guardado': false, 'motivo': 'DOCUMENTO_EN_USO', 'campos': []});
    });
    final p = await hogar.miPerfil();
    expect(p.telefonoPorteria, isNull);
    expect(await hogar.editarPerfil(datos), isA<PerfilGuardado>());
    expect(servidor.peticiones[1].method, 'PUT');
    final r = await hogar.editarPerfil(datos);
    expect((r as PerfilRechazado).detalle, contains('otra persona'));
  });

  test('D5 a · el tope llega como rechazo tipado con la explicación del servidor', () async {
    final (_, hogar, _) = await montar((_) => json(200, {
          'registrado': false,
          'id': null,
          'motivo': 'TOPE_ALCANZADO',
          'explicacion': 'Su vivienda ya tiene 2 vehículos propios.',
        }));
    final r = await hogar.registrarVehiculo(
      const NuevoVehiculo(
        placa: 'ABC123',
        color: 'Gris',
        modelo: '2020',
        marca: null,
        tipo: 'automovil',
        ocupantes: ['r-1'],
      ),
    );
    expect(r, isA<VehiculoRechazado>());
    expect((r as VehiculoRechazado).esTope, isTrue);
    expect(r.explicacion, contains('2 vehículos'));
    expect(servidor.cuerpo(0)['ocupantes'], ['r-1']);
    expect(servidor.cuerpo(0)['tipo'], 'automovil');
  });

  test('D5 a · baja: la respuesta del servidor decide', () async {
    final (_, hogar, _) = await montar((_) => json(200, {'desactivado': false}));
    expect(await hogar.desactivarVehiculo('veh-1'), isFalse);
    expect(servidor.peticiones.single.path, '/copropiedades/cop-1/mi/vehiculos/veh-1/desactivacion');
  });

  test('RN-10 · un estado de consentimiento desconocido NO se pinta como aceptado', () async {
    var estado = 'aceptado';
    final (_, hogar, _) = await montar((_) => json(200, {'estado': estado}));
    expect(
      await hogar.estadoDelConsentimiento(autorizacionId: 'a', consentimientoId: 'c'),
      EstadoDeConsentimiento.aceptado,
    );
    estado = 'algo_nuevo';
    expect(
      await hogar.estadoDelConsentimiento(autorizacionId: 'a', consentimientoId: 'c'),
      EstadoDeConsentimiento.pendiente,
    );
  });

  test('ADR-023 · el cambio de contraseña pasa el motivo del servidor', () async {
    final (_, _, cuenta) = await montar((_) => json(400, {
          'mensaje': {'message': 'A la contraseña le falta: un número'},
        }));
    await expectLater(
      cuenta.cambiarContrasena(actual: 'a', nueva: 'b'),
      throwsA(isA<Fallo>().having((f) => f.detalle, 'detalle', contains('un número'))),
    );
  });

  test('sin copropiedad en la sesión, ninguna ruta sale', () async {
    final (alta, _, _) = await montar((_) => json(200, {}));
    await sesion.cerrar();
    await expectLater(
      alta.miAlta(),
      throwsA(isA<Fallo>().having((f) => f.clase, 'clase', ClaseDeFallo.sinPermiso)),
    );
    expect(servidor.peticiones, isEmpty);
  });
}
