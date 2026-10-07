/// 15-X (D2) · cuándo el primer ingreso ofrece el rostro: sin rostro y sin
/// «Ahora no» de ESA cuenta; y nunca bloquea, ni sin red ni con el llavero roto.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/oferta_del_rostro.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/infraestructura/almacen/almacen_de_texto.dart';

import '../dobles/rostro_falso.dart';

class LlaveroRoto implements AlmacenDeTexto {
  @override
  Future<String?> leer(String clave) async => throw Exception('llavero bloqueado');
  @override
  Future<void> escribir(String clave, String valor) async => throw Exception('llavero bloqueado');
  @override
  Future<void> borrar(String clave) async {}
}

void main() {
  test('sin rostro y sin «Ahora no»: se ofrece', () async {
    final o = OfertaDelRostro(rostro: RostroFalso(), almacen: AlmacenDeTextoEnMemoria());
    expect(await o.seOfrece('cuenta-a'), isTrue);
  });

  test('con rostro registrado, no', () async {
    final o = OfertaDelRostro(
      rostro: RostroFalso(inicial: RostroFalso.activo),
      almacen: AlmacenDeTextoEnMemoria(),
    );
    expect(await o.seOfrece('cuenta-a'), isFalse);
  });

  test('«Ahora no» se recuerda POR CUENTA, sin volver a preguntar al servidor', () async {
    final rostro = RostroFalso();
    final recuerdos = AlmacenDeTextoEnMemoria();
    final o = OfertaDelRostro(rostro: rostro, almacen: recuerdos);
    await o.ahoraNo('cuenta-a');
    expect(recuerdos.datos, {OfertaDelRostro.claveDe('cuenta-a'): 'si'});
    expect(await o.seOfrece('cuenta-a'), isFalse);
    expect(rostro.lecturas, 0, reason: 'con la respuesta guardada no hace falta leer el rostro');
    expect(await o.seOfrece('cuenta-b'), isTrue, reason: 'otra cuenta del mismo teléfono');
  });

  test('sin red, o con el llavero roto: no se ofrece, y no lanza', () async {
    final sinRed = OfertaDelRostro(
      rostro: RostroFalso()..falloAlLeer = const Fallo(ClaseDeFallo.sinConexion, 'x'),
      almacen: AlmacenDeTextoEnMemoria(),
    );
    expect(await sinRed.seOfrece('cuenta-a'), isFalse);
    final roto = OfertaDelRostro(rostro: RostroFalso(), almacen: LlaveroRoto());
    expect(await roto.seOfrece('cuenta-a'), isFalse);
  });

  test('sin cuenta en la sesión: ni se ofrece ni se anota nada', () async {
    final recuerdos = AlmacenDeTextoEnMemoria();
    final o = OfertaDelRostro(rostro: RostroFalso(), almacen: recuerdos);
    expect(await o.seOfrece(''), isFalse);
    await o.ahoraNo('');
    expect(recuerdos.datos, isEmpty);
  });
}
