import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/edad.dart';
import 'package:ncr_residente/dominio/menores.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/api/generado/clients/residente_api.dart';
import 'package:ncr_residente/infraestructura/api/menores_api.dart';
import 'package:ncr_residente/infraestructura/api/plazas_api.dart';
import 'package:ncr_residente/infraestructura/api/revocacion_api.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';

import '../dobles/servidor_falso.dart';

/// RONDA 15-W · los adaptadores de los menores, las plazas y la revocación:
/// las rutas y los cuerpos del contrato GENERADO, la copropiedad de la sesión,
/// y los rechazos del servidor como `Fallo` con su texto.
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

class RelojDePrueba implements Reloj {
  @override
  DateTime ahora() => DateTime.now().toUtc();
}

Map<String, Object?> plaza(
  int numero, {
  bool libre = false,
  String? codigo,
  bool sinCuenta = false,
}) => {
  'id': 'p$numero',
  'numero': numero,
  'libre': libre,
  'codigo': codigo,
  'ocupante': libre ? null : 'Persona $numero',
  'sinCuenta': sinCuenta,
};

Map<String, Object?> ocupantes(List<Map<String, Object?>> plazas) => {
  'declarados': plazas.length,
  'declarada': true,
  'aviso': 'Usted gestiona las plazas de su vivienda: hasta 4 en total.',
  'tope': 4,
  'esTitular': true,
  'plazas': plazas,
};

void main() {
  late ServidorFalso servidor;

  Future<ResidenteApi> api(ResponseBody Function(RequestOptions) responder) async {
    servidor = ServidorFalso(responder);
    final dio = Dio(BaseOptions(baseUrl: 'http://api.invalid'))..httpClientAdapter = servidor;
    return ResidenteApi(dio);
  }

  Future<SesionEnUso> sesion() async {
    final s = SesionEnUso(
      almacen: AlmacenEnMemoria(),
      autenticador: AutenticadorFijo(),
      reloj: RelojDePrueba(),
    );
    await s.iniciar(
      identificador: const PorUsuario(codigo: 'MIRA', usuario: 'a'),
      clave: 'x',
    );
    return s;
  }

  test('menores: la lista con edad y documento enmascarado; las escrituras, a sus rutas', () async {
    final m = MenoresPorApi(
      api: await api(
        (o) => switch ((o.method, o.path)) {
          ('GET', _) => json(200, [
            {
              'residenteId': 'r-3',
              'nombres': 'Sofía',
              'apellidos': 'Pérez',
              'nombreCompleto': 'Sofía Pérez',
              'fechaNacimiento': '2015-08-21',
              'edad': 11,
              'tipoDocumento': 'tarjeta_identidad',
              'documento': '••••5678',
              'parentesco': 'Hija',
              'plazaId': 'p3',
              'plazaNumero': 3,
              'tieneRostro': false,
            },
          ]),
          (_, final ruta) when ruta.endsWith('codigo-de-traspaso') => json(200, {
            'codigo': 'MIRA-K7PQ-2XWZ',
          }),
          _ => json(200, {'residenteId': 'r-3'}),
        },
      ),
      sesion: await sesion(),
    );
    final lista = await m.misMenores();
    expect(servidor.peticiones[0].path, '/copropiedades/cop-1/mi/menores');
    expect(
      (lista.single.edad, lista.single.documentoLegible, lista.single.plazaNumero),
      (11, 'Tarjeta de identidad ••••5678', 3),
    );

    const datos = DatosDelMenor(
      nombres: 'Tomás',
      apellidos: 'Pérez',
      fechaNacimiento: '2018-01-02',
      parentesco: 'Hijo',
    );
    await m.registrarMenor(
      const NuevoMenor(
        datos: datos,
        tipoDocumento: 'registro_civil',
        numeroDocumento: '1020304050',
        plazaId: 'p2',
      ),
    );
    expect(servidor.cuerpo(1), {
      'nombres': 'Tomás',
      'apellidos': 'Pérez',
      'fechaNacimiento': '2018-01-02',
      'parentesco': 'Hijo',
      'tipoDocumento': 'registro_civil',
      'numeroDocumento': '1020304050',
      'plazaId': 'p2',
    });
    await m.editarMenor('r-3', datos);
    expect(
      (servidor.peticiones[2].method, servidor.peticiones[2].path),
      ('PUT', '/copropiedades/cop-1/mi/menores/r-3'),
    );
    await m.darDeBajaMenor('r-3', motivo: '  Se mudó con su madre ');
    expect(servidor.peticiones[3].path, '/copropiedades/cop-1/mi/menores/r-3/baja');
    expect(servidor.cuerpo(3), {'motivo': 'Se mudó con su madre'});
    expect(await m.codigoDeTraspaso('r-3'), 'MIRA-K7PQ-2XWZ');
  });

  test('menores: el 400 de un mayor de edad llega con el texto del servidor', () async {
    final m = MenoresPorApi(
      api: await api(
        (_) => json(400, {
          'estado': 400,
          'mensaje': {'message': mensajeMayorSinCuenta, 'statusCode': 400},
        }),
      ),
      sesion: await sesion(),
    );
    await expectLater(
      m.registrarMenor(
        const NuevoMenor(
          datos: DatosDelMenor(
            nombres: 'Ana',
            apellidos: 'Pérez',
            fechaNacimiento: '2000-01-01',
            parentesco: 'Hija',
          ),
          tipoDocumento: 'tarjeta_identidad',
          numeroDocumento: '12345',
          plazaId: 'p2',
        ),
      ),
      throwsA(
        isA<Fallo>()
            .having((f) => f.clase, 'clase', ClaseDeFallo.datosNoValidos)
            .having((f) => f.detalle, 'detalle', mensajeMayorSinCuenta),
      ),
    );
  });

  test('plazas: añadir y retirar devuelven las plazas como quedaron; el tope es un fallo con texto', () async {
    var n = 0;
    final p = PlazasPorApi(
      api: await api((_) {
        n += 1;
        return switch (n) {
          1 => json(
            200,
            ocupantes([
              plaza(1),
              plaza(2, libre: true, codigo: 'MIRA-ABCD-EFGH'),
              plaza(3, libre: true, codigo: 'MIRA-WXYZ-2345'),
            ]),
          ),
          2 => json(200, ocupantes([plaza(1), plaza(2, libre: true, codigo: 'MIRA-ABCD-EFGH')])),
          _ => json(409, {
            'estado': 409,
            'mensaje': {
              'message':
                  'Su vivienda tiene el máximo de 4 plazas. Para más, pídalo a la administración.',
            },
          }),
        };
      }),
      sesion: await sesion(),
    );
    final tras = await p.anadirPlaza();
    expect(servidor.peticiones[0].path, '/copropiedades/cop-1/mi/ocupantes/plazas');
    expect((tras.cupo, tras.libres.length), ('3 de 4', 2));
    final retirada = await p.retirarPlaza('p3', motivo: ' Ya no vive aquí ');
    expect(servidor.peticiones[1].path, '/copropiedades/cop-1/mi/ocupantes/plazas/p3/retiro');
    expect(servidor.cuerpo(1), {'motivo': 'Ya no vive aquí'});
    expect(retirada.cupo, '2 de 4');
    await expectLater(
      p.anadirPlaza(),
      throwsA(isA<Fallo>().having((f) => f.detalle, 'detalle', contains('máximo de 4 plazas'))),
    );
  });

  test('revocar: la ruta de la visita, el motivo y de cuántos equipos salió la foto', () async {
    var n = 0;
    final r = RevocacionPorApi(
      api: await api((_) {
        n += 1;
        return n == 1
            ? json(200, {
                'revocada': true,
                'rostrosSuprimidos': 1,
                'equiposRetirados': 2,
                'equiposPendientes': 1,
              })
            : json(409, {
                'estado': 409,
                'mensaje': {'message': 'La visita ya está revocada', 'statusCode': 409},
              });
      }),
      sesion: await sesion(),
    );
    final hecha = await r.revocar('aut-1', motivo: ' Ya no viene ');
    expect(servidor.peticiones[0].path, '/copropiedades/cop-1/mi/visitas/aut-1/revocacion');
    expect(servidor.cuerpo(0), {'motivo': 'Ya no viene'});
    expect((hecha.equiposRetirados, hecha.equiposPendientes), (2, 1));
    await expectLater(
      r.revocar('aut-1', motivo: 'otra vez'),
      throwsA(isA<Fallo>().having((f) => f.detalle, 'detalle', 'La visita ya está revocada')),
    );
  });

  test('un 429 de cualquier ruta se dice en palabras, no «Too Many Requests»', () async {
    final r = RevocacionPorApi(
      api: await api((_) => json(429, {'estado': 429, 'mensaje': 'Too Many Requests'})),
      sesion: await sesion(),
    );
    await expectLater(
      r.revocar('aut-1', motivo: 'x'),
      throwsA(
        isA<Fallo>()
            .having((f) => f.clase, 'clase', ClaseDeFallo.servidor)
            .having((f) => f.detalle, 'detalle', startsWith('Demasiados intentos seguidos')),
      ),
    );
  });
}
