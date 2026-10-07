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

/// RONDA 15-W · el primer ingreso, el cambio de vivienda y los vehículos propios
/// por los adaptadores del hogar: que el primer ingreso ya no lleva vivienda ni
/// código, que los motivos nuevos y los campos rechazados llegan tipados, que lo
/// que el contrato no admite no sale del teléfono, y que editar o eliminar un
/// vehículo obedece a lo que responde el servidor. Vive aparte de
/// `hogar_api_test.dart` para que ningún archivo pase de 300 líneas; por eso el
/// arnés se duplica, igual que en `hogar_15w_api_test.dart`.
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

  Future<(AltaPorApi, HogarPorApi, CuentaPorApi)> montar(
    ResponseBody Function(RequestOptions) responder,
  ) async {
    final sesion = SesionEnUso(
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

  const datos = DatosDePerfil(
    nombres: 'Ana',
    apellidos: 'Pérez',
    fechaNacimiento: null,
    tipoDocumento: 'cedula',
    numeroDocumento: '1000000001',
    correo: 'ana@ejemplo.invalid',
    telefono: '+573000000001',
  );

  const primerIngreso = DatosDePrimerIngreso(
    nombres: 'Ana',
    apellidos: 'Pérez',
    tipoDocumento: 'cedula',
    numeroDocumento: '1000000001',
    telefono: '+573000000001',
    fechaNacimiento: '1990-05-17',
    correo: null,
  );

  test('D3 · el primer ingreso no lleva vivienda ni código; el cambio va a /mi/vinculacion',
      () async {
    final (alta, _, _) = await montar((_) => json(200, {
          'vinculada': true,
          'debeDeclararOcupantes': true,
          'motivo': null,
          'explicacion': null,
          'campos': [],
        }));
    final r = await alta.completarPrimerIngreso(primerIngreso);
    expect(r, isA<AltaHecha>());
    expect((r as AltaHecha).debeDeclararOcupantes, isTrue);
    expect(servidor.peticiones[0].path, endsWith('/mi/alta'));
    expect(servidor.cuerpo(0), {
      'nombres': 'Ana',
      'apellidos': 'Pérez',
      'tipoDocumento': 'cedula',
      'numeroDocumento': '1000000001',
      'telefono': '+573000000001',
      'fechaNacimiento': '1990-05-17',
      'correo': null,
    });

    await alta.cambiarDeVivienda(
      const SolicitudDeCambioDeVivienda(
        perfil: datos,
        identificador: '7',
        agrupacion: 'B',
        codigo: 'MIRA-ABCD-EFGH',
      ),
    );
    expect(servidor.peticiones[1].path, endsWith('/mi/vinculacion'));
    expect(servidor.cuerpo(1)['codigo'], 'MIRA-ABCD-EFGH');
  });

  test('D3 · los motivos nuevos llegan con su texto, y el bloqueo por edad se reconoce',
      () async {
    var n = 0;
    final (alta, _, _) = await montar((_) {
      n += 1;
      return json(200, {
        'vinculada': false,
        'debeDeclararOcupantes': false,
        'motivo': n == 1 ? 'SIN_VIVIENDA' : 'CUENTA_BLOQUEADA_POR_EDAD',
        // El servidor manda su texto la primera vez; la segunda, no.
        'explicacion': n == 1 ? 'La administración debe asignarle su vivienda' : null,
        'campos': [],
      });
    });
    final a = await alta.completarPrimerIngreso(primerIngreso) as AltaRechazada;
    expect((a.sinVivienda, a.explicacion), (true, 'La administración debe asignarle su vivienda'));
    final b = await alta.completarPrimerIngreso(primerIngreso) as AltaRechazada;
    expect(b.bloqueadaPorEdad, isTrue);
    expect(b.explicacion, startsWith('Las cuentas son para mayores de edad'));
  });

  test('D3 · los campos rechazados llegan en un 400 y se devuelven campo por campo', () async {
    final (alta, _, _) = await montar((_) => json(400, {
          'estado': 400,
          'correlacion': 'c-1',
          'mensaje': {
            'mensaje': 'Revise los datos',
            'campos': [
              {'campo': 'telefono', 'motivo': 'El teléfono tiene de 7 a 15 cifras'},
            ],
          },
        }));
    final r = await alta.completarPrimerIngreso(primerIngreso);
    expect((r as AltaConErrores).campos['telefono'], contains('7 a 15'));
  });

  test('D3 · un tipo de documento que el contrato no conoce no sale del teléfono', () async {
    final (alta, _, _) = await montar((_) => json(200, {}));
    final r = await alta.completarPrimerIngreso(
      const DatosDePrimerIngreso(
        nombres: 'Ana',
        apellidos: 'Pérez',
        tipoDocumento: 'otro',
        numeroDocumento: '1000000001',
        telefono: '+573000000001',
        fechaNacimiento: '1990-05-17',
        correo: null,
      ),
    );
    expect((r as AltaConErrores).campos.keys, ['tipoDocumento']);
    expect(servidor.peticiones, isEmpty);
  });

  test('3.5 · el cambio con un 409 sin campos es un fallo con el texto del servidor', () async {
    final (alta, _, _) = await montar((_) => json(409, {
          'estado': 409,
          'mensaje': {'message': 'Ese documento ya pertenece a otra persona'},
        }));
    await expectLater(
      alta.cambiarDeVivienda(
        const SolicitudDeCambioDeVivienda(
          perfil: datos,
          identificador: '7',
          agrupacion: null,
          codigo: 'ABCD-EFGH',
        ),
      ),
      throwsA(isA<Fallo>().having((f) => f.detalle, 'detalle', contains('otra persona'))),
    );
  });

  test('D5 · editar: la placa sólo si cambió; el 409 de la placa con historial llega con su texto',
      () async {
    var n = 0;
    final (_, hogar, _) = await montar((_) {
      n += 1;
      return n == 1
          ? json(200, {'editado': true})
          : json(409, {
              'estado': 409,
              'mensaje': {'message': 'Dé de baja este vehículo y registre el nuevo'},
            });
    });
    await hogar.editarVehiculo(
      'veh-1',
      const EdicionDeVehiculo(color: 'Rojo', modelo: '2021', marca: null, placa: null),
    );
    expect(servidor.peticiones[0].method, 'PUT');
    expect(servidor.peticiones[0].path, '/copropiedades/cop-1/mi/vehiculos/veh-1');
    expect(servidor.cuerpo(0)['placa'], isNull);
    await expectLater(
      hogar.editarVehiculo(
        'veh-1',
        const EdicionDeVehiculo(color: 'Rojo', modelo: '2021', marca: 'Kia', placa: 'XYZ987'),
      ),
      throwsA(isA<Fallo>().having((f) => f.detalle, 'detalle', 'Dé de baja este vehículo y registre el nuevo')),
    );
    expect(servidor.cuerpo(1)['placa'], 'XYZ987');
  });

  test('D5 · eliminar: el servidor dice si lo borró o lo dio de baja', () async {
    var n = 0;
    final (_, hogar, _) = await montar((_) {
      n += 1;
      return json(200, {'resultado': n == 1 ? 'borrado' : 'dado_de_baja'});
    });
    expect(await hogar.eliminarVehiculo('veh-1'), EliminacionDeVehiculo.borrado);
    expect(servidor.peticiones.single.method, 'DELETE');
    expect(await hogar.eliminarVehiculo('veh-2'), EliminacionDeVehiculo.dadoDeBaja);
  });
}
