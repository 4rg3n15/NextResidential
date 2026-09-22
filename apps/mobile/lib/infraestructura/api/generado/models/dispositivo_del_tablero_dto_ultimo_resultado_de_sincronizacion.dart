// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Estado de la sincronización de plantilla más reciente de este equipo. Sale de plantilla_sincronizaciones, no de una copia en dispositivos: dos copias del mismo resultado se separan en cuanto alguien reintenta una sola plantilla.
@JsonEnum()
enum DispositivoDelTableroDtoUltimoResultadoDeSincronizacion {
  @JsonValue('pendiente')
  pendiente('pendiente'),
  @JsonValue('sincronizada')
  sincronizada('sincronizada'),
  @JsonValue('fallida')
  fallida('fallida'),
  @JsonValue('suprimida')
  suprimida('suprimida'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const DispositivoDelTableroDtoUltimoResultadoDeSincronizacion(this.json);

  factory DispositivoDelTableroDtoUltimoResultadoDeSincronizacion.fromJson(String json) => values.firstWhere(
        (e) => e.json == json,
        orElse: () => $unknown,
      );

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError('Cannot convert enum value with null JSON representation to String. '
          'This usually happens for \$unknown or @JsonValue(null) entries.');
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();
  /// Returns all defined enum values excluding the $unknown value.
  static List<DispositivoDelTableroDtoUltimoResultadoDeSincronizacion> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
