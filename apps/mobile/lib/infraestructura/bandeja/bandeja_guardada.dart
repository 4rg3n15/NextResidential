/// La bandeja de salida, guardada en el llavero entre arranques.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// DOS CLAVES POR RAZONES DE PESO
///
/// Cada envío lleva la foto del visitante (hasta ~240 KB en base64). Si toda la
/// bandeja fuera UN valor, cada reintento —que sólo cambia un contador— volvería
/// a escribir todas las fotos. Por eso:
///
///   · `ncr.bandeja.indice` — lo pequeño: clave, cuándo, intentos, próximo
///     intento, último error y de qué cuenta es. Se reescribe en cada cambio.
///   · `ncr.bandeja.cuerpo.<clave>` — el cuerpo con la foto. Se escribe UNA vez
///     al encolar y se borra al salir de la bandeja.
///
/// El orden de escritura es el que no pierde nada si la app muere a medias:
/// primero los cuerpos nuevos, después el índice, y al final se borran los que
/// ya no están. Un índice nunca apunta a un cuerpo que no existe; lo peor que
/// puede quedar es un cuerpo huérfano, y al leer se ignora.
library;

import 'dart:convert';

import '../../dominio/bandeja_de_salida.dart';
import '../../dominio/puertos.dart';

class BandejaGuardada implements AlmacenDeBandeja {
  BandejaGuardada(this._almacen);

  static const indice = 'ncr.bandeja.indice';
  static String claveDelCuerpo(String clave) => 'ncr.bandeja.cuerpo.$clave';

  final AlmacenDeTexto _almacen;

  /// Las claves cuyo cuerpo ya está escrito. `null` hasta la primera lectura.
  Set<String>? _conCuerpo;

  @override
  Future<List<EnvioPendiente>> leer() async {
    final pendientes = <EnvioPendiente>[];
    for (final meta in await _leerIndice()) {
      final clave = meta['clave'];
      if (clave is! String) continue;
      final cuerpo = _mapaDe(await _almacen.leer(claveDelCuerpo(clave)));
      final envio = cuerpo == null ? null : envioDe(meta, cuerpo);
      // Un envío ilegible —una versión anterior, un guardado a medias— se
      // descarta aquí en vez de impedir que se lean los demás.
      if (envio != null) pendientes.add(envio);
    }
    _conCuerpo = pendientes.map((p) => p.claveDeIdempotencia).toSet();
    return pendientes;
  }

  @override
  Future<void> guardar(List<EnvioPendiente> pendientes) async {
    final antes = _conCuerpo ?? {for (final m in await _leerIndice()) '${m['clave']}'};
    final ahora = pendientes.map((p) => p.claveDeIdempotencia).toSet();
    for (final p in pendientes.where((p) => !antes.contains(p.claveDeIdempotencia))) {
      await _almacen.escribir(claveDelCuerpo(p.claveDeIdempotencia), jsonEncode(p.cuerpo));
    }
    await _almacen.escribir(indice, jsonEncode(pendientes.map(metaDe).toList()));
    for (final clave in antes.difference(ahora)) {
      await _almacen.borrar(claveDelCuerpo(clave));
    }
    _conCuerpo = ahora;
  }

  Future<List<Map<String, Object?>>> _leerIndice() async {
    final crudo = await _almacen.leer(indice);
    if (crudo == null) return const [];
    try {
      final lista = jsonDecode(crudo);
      if (lista is! List) return const [];
      return [
        for (final m in lista)
          if (m is Map) Map<String, Object?>.from(m),
      ];
    } on FormatException {
      return const [];
    }
  }

  static Map<String, Object?>? _mapaDe(String? crudo) {
    if (crudo == null) return null;
    try {
      final m = jsonDecode(crudo);
      return m is Map ? Map<String, Object?>.from(m) : null;
    } on FormatException {
      return null;
    }
  }
}

/// Lo pequeño de un envío, para el índice.
Map<String, Object?> metaDe(EnvioPendiente p) => {
  'clave': p.claveDeIdempotencia,
  'recurso': p.recurso,
  'encoladoEn': p.encoladoEn.toUtc().toIso8601String(),
  'intentos': p.intentos,
  'proximoIntentoEn': p.proximoIntentoEn?.toUtc().toIso8601String(),
  'ultimoError': p.ultimoError,
  'propietario': p.propietario,
};

/// El envío de vuelta, o `null` si el índice no tiene la forma esperada.
EnvioPendiente? envioDe(Map<String, Object?> meta, Map<String, Object?> cuerpo) {
  final clave = meta['clave'];
  final recurso = meta['recurso'];
  final encolado = _fecha(meta['encoladoEn']);
  final intentos = meta['intentos'];
  final proximo = meta['proximoIntentoEn'];
  final error = meta['ultimoError'];
  final propietario = meta['propietario'];
  if (clave is! String ||
      recurso is! String ||
      encolado == null ||
      intentos is! int ||
      (proximo != null && _fecha(proximo) == null) ||
      (error != null && error is! String) ||
      (propietario != null && propietario is! String)) {
    return null;
  }
  return EnvioPendiente(
    claveDeIdempotencia: clave,
    recurso: recurso,
    cuerpo: cuerpo,
    encoladoEn: encolado,
    intentos: intentos,
    proximoIntentoEn: _fecha(proximo),
    ultimoError: error as String?,
    propietario: propietario as String?,
  );
}

DateTime? _fecha(Object? v) => v is String ? DateTime.tryParse(v) : null;
