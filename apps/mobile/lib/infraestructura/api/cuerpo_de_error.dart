/// Lo que trae el CUERPO de un rechazo de la API (RONDA 15-W).
///
/// Todo error de la API sale con el mismo sobre del filtro global:
/// `{ estado, correlacion, mensaje }`, y lo útil va DENTRO de `mensaje`:
///
///  · `{ message: […], error, statusCode }` — la forma del `ValidationPipe`;
///  · `{ mensaje: 'Revise los datos', campos: [{campo, motivo}] }` — los campos
///    que rechazó un caso de uso (primer ingreso, cambio de vivienda, «Crear
///    cuenta»);
///  · `{ message: '…', error, statusCode }` — un rechazo con su texto;
///  · y en «Crear cuenta», TODO 400 lleva además `politica: {version, texto}`.
///
/// Se lee sin suponer una sola forma: el sobre y la carga se buscan en los dos
/// niveles. Lo que sale de aquí son entidades del dominio y textos; ningún
/// `Map` del transporte cruza a la presentación.
library;

import 'package:dio/dio.dart';

import '../../dominio/registro.dart';

/// La carga del sobre, si la hay; si no, el propio cuerpo.
Map<Object?, Object?>? _carga(Object? cuerpo) {
  if (cuerpo is! Map) return null;
  final interno = cuerpo['mensaje'];
  return interno is Map ? interno : cuerpo;
}

/// Los campos rechazados, por nombre. Vacío si el rechazo no es de campos.
Map<String, String> camposDelRechazo(Object? cuerpo) {
  final campos = _carga(cuerpo)?['campos'];
  if (campos is! List) return const {};
  return {
    for (final c in campos)
      if (c is Map && c['campo'] is String && c['motivo'] is String)
        c['campo'] as String: c['motivo'] as String,
  };
}

/// La política de tratamiento de datos que viaja en los 400 de «Crear cuenta».
PoliticaDeDatos? politicaDelRechazo(Object? cuerpo) {
  final politica = _carga(cuerpo)?['politica'] ?? (cuerpo is Map ? cuerpo['politica'] : null);
  if (politica is! Map) return null;
  final version = politica['version'];
  final texto = politica['texto'];
  if (version is! String || texto is! String || version.isEmpty || texto.isEmpty) return null;
  return PoliticaDeDatos(version: version, texto: texto);
}

/// Los segundos del `Retry-After` de un 429, si los trae.
int? segundosDeEspera(Response<Object?>? respuesta) {
  final valor = respuesta?.headers.value('retry-after');
  return valor == null ? null : int.tryParse(valor.trim());
}

/// «Espere N minutos»: lo que el residente puede hacer ante un 429.
String mensajeDeEspera(int? segundos) {
  const inicio = 'Demasiados intentos seguidos.';
  if (segundos == null || segundos <= 0) {
    return '$inicio Espere unos minutos y vuelva a intentarlo.';
  }
  final minutos = (segundos / 60).ceil();
  return minutos <= 1
      ? '$inicio Espere un minuto y vuelva a intentarlo.'
      : '$inicio Espere $minutos minutos y vuelva a intentarlo.';
}
