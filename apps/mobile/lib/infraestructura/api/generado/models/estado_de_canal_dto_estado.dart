// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// El canal de audio del equipo admite UNA conversación a la vez (ADR-01). El segundo operador no se rechaza: se encola.
@JsonEnum()
enum EstadoDeCanalDtoEstado {
  @JsonValue('abierta')
  abierta('abierta'),
  @JsonValue('en_espera')
  enEspera('en_espera'),
  @JsonValue('cerrada')
  cerrada('cerrada'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const EstadoDeCanalDtoEstado(this.json);

  factory EstadoDeCanalDtoEstado.fromJson(String json) => values.firstWhere(
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
  static List<EstadoDeCanalDtoEstado> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
