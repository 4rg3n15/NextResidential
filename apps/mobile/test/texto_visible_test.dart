/// Bloque I · NINGÚN TEXTO QUE LA APP ENSEÑA LLEVA CÓDIGOS DEL PROYECTO.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// POR QUÉ UNA PRUEBA Y NO UNA REVISIÓN
///
/// «RN-13», «P-11» o «ADR-032» son el idioma de quien construyó la app, no el de
/// quien la usa. Un residente que lee «como exige RN-05» no aprende nada y
/// desconfía de todo lo demás. Se colaban por lo mismo que se colaban en la
/// consola: el comentario de al lado los usa con razón, y al escribir el texto
/// la referencia salta del comentario a la cadena sin que nadie lo note.
///
/// Una revisión lo encuentra una vez; esta prueba lo encuentra siempre.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// QUÉ MIRA, Y QUÉ NO
///
/// Los LITERALES DE CADENA de todo `lib/` —presentación, dominio, aplicación e
/// infraestructura escrita a mano—, porque todos acaban en pantalla: un
/// `Fallo.detalle` de un adaptador o la explicación de un rechazo del dominio
/// se pintan tal cual. Queda fuera lo generado (`generado/`, `*.g.dart`), que
/// se reescribe en cada corrida y no pinta nada.
///
/// Los COMENTARIOS no se miran: ahí los códigos son trazabilidad y deben
/// seguir. Por eso no basta un `grep`: hay que saber dónde empieza y dónde
/// acaba cada cadena —con sus comillas triples, sus cadenas crudas, sus
/// interpolaciones con cadenas dentro y las cadenas contiguas que Dart une— y
/// dónde hay un comentario de verdad y dónde un `//` dentro de una URL. El
/// escáner de abajo hace eso, y se prueba a sí mismo antes de juzgar la app:
/// un control que nadie ha visto fallar no está demostrado.
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// La expresión del Bloque I, tal cual.
final codigoDelProyecto = RegExp(
  r'\b(?:RN|KPI|KP1|CA|HU|CU|OE|D|P|S|C|E|H-SITIO|BE)-\d{1,3}\b'
  r'|\bADR\b'
  r'|\[SUPUESTO\]'
  r'|\bmigraci[oó]n \d{4}\b',
);

class LiteralDeCadena {
  const LiteralDeCadena(this.texto, this.linea);

  /// El contenido, sin comillas. Las interpolaciones `${…}` se sustituyen por
  /// un espacio (sus cadenas internas son literales aparte) y las cadenas
  /// contiguas vienen ya unidas, como las une el compilador.
  final String texto;
  final int linea;
}

/// Los literales de cadena de un fuente Dart, sin comentarios.
List<LiteralDeCadena> literalesDe(String fuente) => _Escaner(fuente).literales();

class _Tramo {
  _Tramo(this.inicio, this.fin, this.texto);
  final int inicio;
  int fin;
  String texto;
}

class _Escaner {
  _Escaner(this._s);
  final String _s;
  int _i = 0;
  final _tramos = <_Tramo>[];

  List<LiteralDeCadena> literales() {
    _codigo(hastaLaLlave: false);
    _tramos.sort((a, b) => a.inicio.compareTo(b.inicio));
    final unidos = <_Tramo>[];
    _Tramo? externo;
    for (final t in _tramos) {
      final e = externo;
      // Una cadena DENTRO de una interpolación de otra: literal aparte, y no
      // interrumpe la unión de la de fuera con su vecina.
      if (e != null && t.inicio < e.fin) {
        unidos.add(_Tramo(t.inicio, t.fin, t.texto));
        continue;
      }
      // `'RN-' '13'` es UNA cadena para el compilador, y para esta prueba.
      if (e != null && _soloEspacios(_s.substring(e.fin, t.inicio))) {
        e
          ..texto += t.texto
          ..fin = t.fin;
        continue;
      }
      externo = _Tramo(t.inicio, t.fin, t.texto);
      unidos.add(externo);
    }
    return [for (final t in unidos) LiteralDeCadena(t.texto, _linea(t.inicio))];
  }

  bool _empieza(String s) => _s.startsWith(s, _i);

  static bool _esComilla(String c) => c == "'" || c == '"';

  bool _esIdentificador(int j) =>
      j >= 0 && j < _s.length && RegExp(r'[A-Za-z0-9_$]').hasMatch(_s[j]);

  static bool _soloEspacios(String entre) => entre
      .replaceAll(RegExp(r'//[^\n]*'), '')
      .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), '')
      .trim()
      .isEmpty;

  int _linea(int desplazamiento) => '\n'.allMatches(_s.substring(0, desplazamiento)).length + 1;

  /// Código fuera de cadenas. Con `hastaLaLlave`, es el cuerpo de una
  /// interpolación `${…}` y termina en su `}` —contando las llaves que abra—.
  void _codigo({required bool hastaLaLlave}) {
    var profundidad = 0;
    while (_i < _s.length) {
      if (_empieza('//')) {
        final fin = _s.indexOf('\n', _i);
        _i = fin < 0 ? _s.length : fin;
        continue;
      }
      if (_empieza('/*')) {
        _comentarioDeBloque();
        continue;
      }
      final c = _s[_i];
      if (c == 'r' &&
          _i + 1 < _s.length &&
          _esComilla(_s[_i + 1]) &&
          !_esIdentificador(_i - 1)) {
        final inicio = _i;
        _i += 1;
        _cadena(cruda: true, inicio: inicio);
        continue;
      }
      if (_esComilla(c)) {
        _cadena(cruda: false, inicio: _i);
        continue;
      }
      if (hastaLaLlave) {
        if (c == '{') {
          profundidad += 1;
        } else if (c == '}') {
          if (profundidad == 0) {
            _i += 1;
            return;
          }
          profundidad -= 1;
        }
      }
      _i += 1;
    }
  }

  /// Dart anida los comentarios de bloque: `/* a /* b */ c */` es UNO.
  void _comentarioDeBloque() {
    var nivel = 0;
    while (_i < _s.length) {
      if (_empieza('/*')) {
        nivel += 1;
        _i += 2;
      } else if (_empieza('*/')) {
        nivel -= 1;
        _i += 2;
        if (nivel == 0) return;
      } else {
        _i += 1;
      }
    }
  }

  void _cadena({required bool cruda, required int inicio}) {
    final q = _s[_i];
    final cierre = _s.startsWith(q * 3, _i) ? q * 3 : q;
    final triple = cierre.length == 3;
    _i += cierre.length;
    final texto = StringBuffer();
    while (_i < _s.length) {
      if (_empieza(cierre)) {
        _i += cierre.length;
        break;
      }
      final c = _s[_i];
      // Una cadena simple no cruza de línea: si pasa, el fuente está roto y
      // se corta aquí en vez de tragarse el resto del fichero.
      if (!triple && c == '\n') break;
      if (!cruda && c == r'\' && _i + 1 < _s.length) {
        final siguiente = _s[_i + 1];
        texto.write(switch (siguiente) {
          'n' => '\n',
          't' => '\t',
          _ => siguiente,
        });
        _i += 2;
        continue;
      }
      if (!cruda && c == r'$' && _i + 1 < _s.length && _s[_i + 1] == '{') {
        _i += 2;
        texto.write(' ');
        _codigo(hastaLaLlave: true);
        continue;
      }
      texto.write(c);
      _i += 1;
    }
    _tramos.add(_Tramo(inicio, _i, texto.toString()));
  }
}

/// Cada literal de `fuente` que lleva un código, como `línea: «texto»`.
List<String> hallazgosEn(String fuente) => [
      for (final l in literalesDe(fuente))
        for (final m in codigoDelProyecto.allMatches(l.texto))
          '${l.linea}: «${m.group(0)}» en «${l.texto.replaceAll('\n', ' ').trim()}»',
    ];

void main() {
  group('el escáner se prueba a sí mismo antes de juzgar la app', () {
    // Una muestra con TODAS las formas en que un código puede esconderse en
    // una cadena, y en que un comentario puede parecer una.
    const muestra = r"""
// RN-13 en un comentario de línea no cuenta.
/// KPI-09 en un comentario de documentación tampoco.
/* ADR en un bloque /* anidado CA-01 */ que sigue siendo comentario */
final a = 'Vea la RN-13 del contrato';
final b = "Lo decidió el ADR-01";
final c = '''
triple con [SUPUESTO] dentro
''';
final d = r'cruda con la migración 0029';
final e = 'unida ' 'RN-' '14 por adyacencia';
final f = 'dentro de ${cond ? 'HU-07' : ''} una interpolación';
final g = 'http://esto-no-es-un-comentario KPI-12';
final h = 'escape \' y después P-11';
final i = 'limpia'; // y el código S-59 en el comentario de al lado no cuenta
""";

    test('encuentra el código en cada forma de cadena', () {
      final h = hallazgosEn(muestra);
      for (final esperado in [
        '«RN-13»',
        '«ADR»',
        '«[SUPUESTO]»',
        '«migración 0029»',
        '«RN-14»',
        '«HU-07»',
        '«KPI-12»',
        '«P-11»',
      ]) {
        expect(h.where((x) => x.contains(esperado)), hasLength(1), reason: '$esperado en $h');
      }
    });

    test('y NO lo encuentra en los comentarios', () {
      final h = hallazgosEn(muestra).join('\n');
      for (final deComentario in ['KPI-09', 'CA-01', 'S-59']) {
        expect(h, isNot(contains(deComentario)), reason: deComentario);
      }
      // El RN-13 que aparece es el de la cadena (línea 4), no el del
      // comentario de la línea 1.
      expect(hallazgosEn(muestra).where((x) => x.startsWith('1:')), isEmpty);
    });

    test('lo que sólo se parece a un código no salta', () {
      expect(
        hallazgosEn(r"""
final a = 'La foto quedó en 2 de 3 equipos';
final b = 'Placa ABC-123 · Ley 1581 de 2012';
final c = 'Torre 4 · Casa 42';
"""),
        isEmpty,
      );
    });
  });

  test('Bloque I · ningún literal de lib/ enseña un código del proyecto', () {
    final raiz = Directory('lib');
    expect(raiz.existsSync(), isTrue, reason: 'la prueba corre desde apps/mobile');
    final ficheros = raiz
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'))
        .where((f) => !f.path.endsWith('.g.dart'))
        .where((f) => !f.path.replaceAll(r'\', '/').contains('/infraestructura/api/generado/'))
        .toList();
    // Sin esto, un `lib/` vacío o mal resuelto daría un verde sin haber
    // mirado nada.
    expect(ficheros.length, greaterThan(40), reason: 'se escanearon ${ficheros.length}');

    final hallazgos = [
      for (final f in ficheros)
        for (final h in hallazgosEn(f.readAsStringSync())) '${f.path}:$h',
    ];
    expect(hallazgos, isEmpty, reason: hallazgos.join('\n'));
  });
}
