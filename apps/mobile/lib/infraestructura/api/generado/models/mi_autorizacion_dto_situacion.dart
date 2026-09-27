// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Lo que enseña la tarjeta de la app, con el reloj del servidor: vigente, programada, vencida o rechazada (anulada por portería o superadministración)
@JsonEnum()
enum MiAutorizacionDtoSituacion {
  @JsonValue('vigente')
  vigente('vigente'),
  @JsonValue('programada')
  programada('programada'),
  @JsonValue('vencida')
  vencida('vencida'),
  @JsonValue('rechazada')
  rechazada('rechazada'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const MiAutorizacionDtoSituacion(this.json);

  factory MiAutorizacionDtoSituacion.fromJson(String json) => values.firstWhere(
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
  static List<MiAutorizacionDtoSituacion> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
