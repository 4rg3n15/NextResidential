// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// H-SITIO-10 · si otro aparato puede abrir `url`. `bucle_local`: 127.0.0.1/localhost, que en un teléfono es el propio teléfono; la consola lo advierte junto al QR.
@JsonEnum()
enum EnlaceDeConsentimientoDtoAlcance {
  @JsonValue('ausente')
  ausente('ausente'),
  @JsonValue('bucle_local')
  bucleLocal('bucle_local'),
  @JsonValue('alcanzable')
  alcanzable('alcanzable'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const EnlaceDeConsentimientoDtoAlcance(this.json);

  factory EnlaceDeConsentimientoDtoAlcance.fromJson(String json) => values.firstWhere(
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
  static List<EnlaceDeConsentimientoDtoAlcance> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
