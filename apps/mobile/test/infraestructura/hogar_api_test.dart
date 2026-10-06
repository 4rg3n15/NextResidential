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
/// desconocido nunca se pinta como éxito. El primer ingreso, el cambio de
/// vivienda y los vehículos de 15-W están en `primer_ingreso_y_vehiculos_api_test.dart`.
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
          'viviendaAsignada': false,
          'debeDeclararOcupantes': false,
          'vocabulario': {
            'copropiedadNombre': 'Torres del Parque',
            'tipo': 'apartamentos',
            'etiquetaVivienda': 'Apartamento',
            'etiquetaAgrupacion': 'Torre',
            'codigoCorto': 'TORR',
          },
          'pideAgrupacion': true,
          'avisoOcupantes': 'Usted gestiona las plazas de su vivienda: hasta 4 en total.',
          'aviso': 'La administración debe asignarle su vivienda',
        }));
    final e = await alta.miAlta();
    expect(servidor.peticiones.single.path, '/copropiedades/cop-1/mi/alta');
    expect(e.vocabulario.etiquetaAgrupacion, 'Torre');
    expect(e.vocabulario.codigoCorto, 'TORR');
    expect(e.pideAgrupacion, isTrue);
    expect(e.avisoOcupantes, contains('hasta 4'));
    // 15-W · una cuenta sin vivienda asignada lo sabe y lee el aviso.
    expect(e.viviendaAsignada, isFalse);
    expect(e.aviso, 'La administración debe asignarle su vivienda');
  });

  test('D-W10 · las plazas llegan con el tope, el titular y los códigos con prefijo', () async {
    var n = 0;
    final (alta, _, _) = await montar((_) {
      n += 1;
      return n == 1
          ? json(200, {
              'declarados': 3,
              'declarada': true,
              'aviso': 'Usted gestiona las plazas de su vivienda: hasta 4 en total.',
              'tope': 4,
              'esTitular': true,
              'plazas': [
                {
                  'id': 'p1',
                  'numero': 1,
                  'libre': false,
                  'codigo': null,
                  'ocupante': 'Ana',
                  'sinCuenta': false,
                },
                {
                  'id': 'p2',
                  'numero': 2,
                  'libre': true,
                  'codigo': 'MIRA-ABCD-EFGH',
                  'ocupante': null,
                  'sinCuenta': false,
                },
                {
                  'id': 'p3',
                  'numero': 3,
                  'libre': false,
                  'codigo': null,
                  'ocupante': 'Sofía',
                  'sinCuenta': true,
                },
              ],
            })
          : json(403, {'mensaje': 'Los ocupantes ya se declararon, o no es el titular'});
    });
    final o = await alta.declararOcupantes(3);
    // 15-W · la confirmación de «definitivo» ya no se envía.
    expect(servidor.cuerpo(0)['numero'], 3);
    expect(servidor.cuerpo(0)['confirmoQueEsDefinitivo'], isNull);
    expect((o.cupo, o.esTitular), ('3 de 4', true));
    expect(o.libres.single.codigo, 'MIRA-ABCD-EFGH');
    expect(o.plazas.last.sinCuenta, isTrue);
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
