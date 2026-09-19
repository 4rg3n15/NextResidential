// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Respuesta del Edge cuando la regla no está en su caché (RN-16). «denegar» es el valor conservador que impone §2.1.4.
@JsonEnum()
enum ConfiguracionDeCopropiedadDtoPoliticaContingenciaEdge {
  @JsonValue('denegar')
  denegar('denegar'),
  @JsonValue('escalar_portero')
  escalarPortero('escalar_portero'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ConfiguracionDeCopropiedadDtoPoliticaContingenciaEdge(this.json);

  factory ConfiguracionDeCopropiedadDtoPoliticaContingenciaEdge.fromJson(String json) => values.firstWhere(
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
  static List<ConfiguracionDeCopropiedadDtoPoliticaContingenciaEdge> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
