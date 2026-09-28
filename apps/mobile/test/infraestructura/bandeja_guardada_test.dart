import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/bandeja_de_salida.dart';
import 'package:ncr_residente/infraestructura/almacen/almacen_de_texto.dart';
import 'package:ncr_residente/infraestructura/bandeja/bandeja_guardada.dart';

/// Cuenta las escrituras por clave: la foto se escribe UNA vez, no en cada
/// reintento.
class LlaveroQueCuenta extends AlmacenDeTextoEnMemoria {
  final Map<String, int> escrituras = {};

  @override
  Future<void> escribir(String clave, String valor) {
    escrituras[clave] = (escrituras[clave] ?? 0) + 1;
    return super.escribir(clave, valor);
  }
}

EnvioPendiente envio(String clave, {int intentos = 0, String? propietario = 'ana@cop'}) =>
    EnvioPendiente(
      claveDeIdempotencia: clave,
      recurso: 'mi/visitas',
      cuerpo: {'visitante': 'Ana', 'foto': {'jpegBase64': 'QUJD'}},
      encoladoEn: DateTime.utc(2026, 9, 20, 12),
      intentos: intentos,
      proximoIntentoEn: intentos == 0 ? null : DateTime.utc(2026, 9, 20, 12, 1),
      ultimoError: intentos == 0 ? null : 'sin red',
      propietario: propietario,
    );

void main() {
  test('ida y vuelta: todo lo del envío, con su cuenta y su foto', () async {
    final llavero = AlmacenDeTextoEnMemoria();
    await BandejaGuardada(llavero).guardar([envio('k1', intentos: 2), envio('k2', propietario: null)]);

    final leidos = await BandejaGuardada(llavero).leer();
    expect(leidos.map((e) => e.claveDeIdempotencia), ['k1', 'k2']);
    final k1 = leidos.first;
    expect(k1.intentos, 2);
    expect(k1.proximoIntentoEn, DateTime.utc(2026, 9, 20, 12, 1));
    expect(k1.ultimoError, 'sin red');
    expect(k1.propietario, 'ana@cop');
    expect(k1.encoladoEn, DateTime.utc(2026, 9, 20, 12));
    expect((k1.cuerpo['foto']! as Map)['jpegBase64'], 'QUJD');
    expect(leidos.last.propietario, isNull);
  });

  test('LA FOTO SE ESCRIBE UNA VEZ: un reintento sólo reescribe el índice', () async {
    final llavero = LlaveroQueCuenta();
    final bandeja = BandejaGuardada(llavero);
    await bandeja.leer();
    await bandeja.guardar([envio('k1')]);
    await bandeja.guardar([envio('k1', intentos: 1)]);
    await bandeja.guardar([envio('k1', intentos: 2)]);
    expect(llavero.escrituras[BandejaGuardada.claveDelCuerpo('k1')], 1);
    expect(llavero.escrituras[BandejaGuardada.indice], 3);
  });

  test('lo que sale de la bandeja se BORRA del llavero, foto incluida', () async {
    final llavero = AlmacenDeTextoEnMemoria();
    final bandeja = BandejaGuardada(llavero);
    await bandeja.guardar([envio('k1'), envio('k2')]);
    await bandeja.guardar([envio('k2')]);
    expect(llavero.datos.containsKey(BandejaGuardada.claveDelCuerpo('k1')), isFalse);
    expect(llavero.datos.containsKey(BandejaGuardada.claveDelCuerpo('k2')), isTrue);

    // Otra instancia (otro arranque) que guarda sin haber leído: sabe qué había.
    await BandejaGuardada(llavero).guardar(const []);
    expect(llavero.datos.keys, [BandejaGuardada.indice]);
  });

  test('lo ilegible se descarta sin llevarse lo demás', () async {
    final llavero = AlmacenDeTextoEnMemoria();
    await BandejaGuardada(llavero).guardar([envio('buena')]);
    final indice = jsonDecode(llavero.datos[BandejaGuardada.indice]!) as List;
    llavero.datos[BandejaGuardada.indice] = jsonEncode([
      ...indice,
      {'clave': 'sin-cuerpo', 'recurso': 'mi/visitas', 'encoladoEn': '2026-09-20T12:00:00Z', 'intentos': 0},
      {'clave': 'mala', 'recurso': 'mi/visitas', 'encoladoEn': 'ayer', 'intentos': 0},
      {'sin': 'clave'},
      'ni siquiera un mapa',
    ]);
    llavero.datos[BandejaGuardada.claveDelCuerpo('mala')] = '{}';
    expect((await BandejaGuardada(llavero).leer()).map((e) => e.claveDeIdempotencia), ['buena']);

    llavero.datos[BandejaGuardada.claveDelCuerpo('buena')] = 'no es json';
    expect(await BandejaGuardada(llavero).leer(), isEmpty);

    llavero.datos[BandejaGuardada.indice] = '{roto';
    expect(await BandejaGuardada(llavero).leer(), isEmpty);
    llavero.datos[BandejaGuardada.indice] = '{"no":"lista"}';
    expect(await BandejaGuardada(llavero).leer(), isEmpty);
  });

  test('envioDe rechaza un índice con tipos que no son', () {
    final bien = metaDe(envio('k1', intentos: 1));
    expect(envioDe(bien, const {}), isNotNull);
    for (final (campo, valor) in [
      ('intentos', '1'),
      ('proximoIntentoEn', 'luego'),
      ('ultimoError', 7),
      ('propietario', 7),
      ('recurso', null),
    ]) {
      expect(envioDe({...bien, campo: valor}, const {}), isNull, reason: campo);
    }
  });
}
