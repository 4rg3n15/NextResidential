import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/servidor_en_uso.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/configuracion/ambiente.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/direccion_del_servidor.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/almacen/almacen_de_texto.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';

import '../dobles/sincronizacion.dart';

const compilada = 'http://mac-de-argenis.local:3000';
const otra = 'http://oficina.local:3000';

class RelojFijo implements Reloj {
  @override
  DateTime ahora() => DateTime.utc(2026, 9, 20, 12);
}

class AutenticadorFijo implements Autenticador {
  @override
  Future<Sesion> iniciarSesion(IdentificadorDeAcceso i, {required String clave}) async => Sesion(
        tokenDeAcceso: 'a',
        tokenDeRefresco: 'r',
        expiraEn: DateTime.utc(2026, 9, 20, 12, 5),
        usuarioId: 'u',
        copropiedadId: 'c',
        correo: 'x@y.invalid',
      );

  @override
  Future<Sesion> renovar(Sesion sesion) => throw UnimplementedError();
}

void main() {
  test('2a · la dirección COMPILADA puede ser un nombre .local: arranca y es la inicial', () async {
    final ambiente = Ambiente(
      apiUrl: compilada,
      supabaseUrl: 'http://supabase.invalid',
      supabaseClavePublicable: '${'sb_publishable'}_de_prueba',
    );
    expect(ambiente.aserciones(), isEmpty);
    // Y la regla de «Servidor» la admite igual: volver a ella no es un error.
    expect(revisarDireccion(ambiente.apiUrl), isA<DireccionAceptada>());
    final d = DireccionDelServidor(compilada: ambiente.apiUrl, almacen: AlmacenDeTextoEnMemoria());
    await d.recuperar();
    expect(d.actual, 'http://mac-de-argenis.local:3000');
  });

  group('DireccionDelServidor · la guardada gana a la compilada', () {
    test('sin nada guardado, la compilada', () async {
      final d = DireccionDelServidor(compilada: compilada, almacen: AlmacenDeTextoEnMemoria());
      await d.recuperar();
      expect(d.actual, compilada);
      expect(d.value, compilada);
      expect(d.esLaCompilada, isTrue);
    });

    test('lo guardado sobrevive a «cerrar y volver a abrir» con el mismo llavero', () async {
      final llavero = AlmacenDeTextoEnMemoria();
      final antes = DireccionDelServidor(compilada: compilada, almacen: llavero);
      var avisos = 0;
      antes.addListener(() => avisos += 1);
      await antes.fijar(otra);
      expect(avisos, 1, reason: 'quien sigue la dirección se entera');

      final despues = DireccionDelServidor(compilada: compilada, almacen: llavero);
      await despues.recuperar();
      expect(despues.actual, otra);
      expect(despues.esLaCompilada, isFalse);
    });

    test('[SUPUESTO] reinstalar con OTRA dirección compilada descarta la guardada', () async {
      final llavero = AlmacenDeTextoEnMemoria();
      await DireccionDelServidor(compilada: compilada, almacen: llavero).fijar(otra);
      final nueva = DireccionDelServidor(compilada: 'http://nuevo.local:3000', almacen: llavero);
      await nueva.recuperar();
      expect(nueva.actual, 'http://nuevo.local:3000');
    });

    test('lo guardado que ya no es admisible, o ilegible, no se usa', () async {
      final llavero = AlmacenDeTextoEnMemoria();
      llavero.datos[DireccionDelServidor.clave] =
          jsonEncode({'url': 'http://203.0.113.7', 'compilada': compilada});
      final d = DireccionDelServidor(compilada: compilada, almacen: llavero);
      await d.recuperar();
      expect(d.actual, compilada);

      llavero.datos[DireccionDelServidor.clave] = 'no es json';
      await d.recuperar();
      expect(d.actual, compilada);

      await DireccionDelServidor(compilada: compilada, almacen: AlmacenRoto()).recuperar();
    });

    test('restablecer vuelve a la compilada y borra la guardada', () async {
      final llavero = AlmacenDeTextoEnMemoria();
      final d = DireccionDelServidor(compilada: compilada, almacen: llavero);
      await d.fijar(otra);
      await d.restablecer();
      expect(d.actual, compilada);
      expect(llavero.datos, isEmpty);
    });
  });

  group('CambioDeServidor · revisar, PROBAR, guardar, cerrar la sesión', () {
    late SesionEnUso sesion;
    late ComprobadorFijo comprobador;
    late AlmacenDeTextoEnMemoria llavero;
    late CambioDeServidor cambio;

    setUp(() async {
      sesion = SesionEnUso(
        almacen: AlmacenEnMemoria(),
        autenticador: AutenticadorFijo(),
        reloj: RelojFijo(),
      );
      await sesion.iniciar(identificador: PorCorreo('x@y.invalid'), clave: 'z');
      comprobador = ComprobadorFijo();
      llavero = AlmacenDeTextoEnMemoria();
      cambio = cambioDeServidor(
        sesion,
        compilada: compilada,
        almacen: llavero,
        comprobador: comprobador,
      );
    });

    test('una dirección que la regla rechaza ni se prueba', () async {
      final r = await cambio.cambiar('http://203.0.113.7:3000');
      expect(r, isA<ServidorRechazado>());
      expect((r as ServidorRechazado).motivo, contains('https://'));
      expect(comprobador.probadas, isEmpty);
      expect(sesion.haySesion, isTrue);
    });

    test('si /health no contesta como Next Control, NO se guarda y la sesión sigue', () async {
      comprobador.salud = SaludDelServidor.noEsNextControl;
      final r = await cambio.cambiar(otra);
      expect((r as ServidorRechazado).motivo, mensajeDeSalud(SaludDelServidor.noEsNextControl));
      expect(comprobador.probadas, [otra]);
      expect(cambio.direccion.actual, compilada);
      expect(llavero.datos, isEmpty);
      expect(sesion.haySesion, isTrue);
    });

    test('si contesta, se guarda NORMALIZADA y la sesión se cierra', () async {
      final r = await cambio.cambiar('  http://Oficina.local:3000/ ');
      expect(r, isA<ServidorCambiado>());
      expect((r as ServidorCambiado).url, otra);
      expect(r.cerroSesion, isTrue);
      expect(cambio.direccion.actual, otra);
      expect(sesion.haySesion, isFalse, reason: 'la sesión es del servidor anterior');
    });

    test('la sesión ya está cerrada cuando se avisa del cambio', () async {
      bool? habiaSesionAlAvisar;
      cambio.direccion.addListener(() => habiaSesionAlAvisar = sesion.haySesion);
      await cambio.cambiar(otra);
      expect(habiaSesionAlAvisar, isFalse);
    });

    test('la misma dirección que ya se usa no cierra nada', () async {
      final r = await cambio.cambiar(compilada);
      expect((r as ServidorCambiado).cerroSesion, isFalse);
      expect(sesion.haySesion, isTrue);
    });

    test('restablecer cierra la sesión y vuelve a la de instalación, sin probarla', () async {
      await cambio.restablecer();
      expect(sesion.haySesion, isTrue, reason: 'ya era la de instalación: nada que hacer');

      await cambio.cambiar(otra);
      await sesion.iniciar(identificador: PorCorreo('x@y.invalid'), clave: 'z');
      comprobador.probadas.clear();
      await cambio.restablecer();
      expect(cambio.direccion.actual, compilada);
      expect(sesion.haySesion, isFalse);
      expect(comprobador.probadas, isEmpty);
    });
  });
}
