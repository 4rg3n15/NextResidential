// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Una sola fuente de verdad: última señal (latido, evento, escucha o sondeo) contra el umbral de la copropiedad, con la credencial y la escucha por delante
@JsonEnum()
enum EstadoDelEquipoDtoEnLinea {
  @JsonValue('en_linea')
  enLinea('en_linea'),
  @JsonValue('degradado')
  degradado('degradado'),
  @JsonValue('fuera_de_linea')
  fueraDeLinea('fuera_de_linea'),
  @JsonValue('sin_comprobar')
  sinComprobar('sin_comprobar'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const EstadoDelEquipoDtoEnLinea(this.json);

  factory EstadoDelEquipoDtoEnLinea.fromJson(String json) => values.firstWhere(
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
  static List<EstadoDelEquipoDtoEnLinea> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
