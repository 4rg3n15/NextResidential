// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ResultadoDeVehiculoPropioDtoMotivo {
  @JsonValue('TOPE_ALCANZADO')
  topeAlcanzado('TOPE_ALCANZADO'),
  @JsonValue('PLACA_DUPLICADA')
  placaDuplicada('PLACA_DUPLICADA'),
  @JsonValue('VIVIENDA_INACTIVA')
  viviendaInactiva('VIVIENDA_INACTIVA'),
  @JsonValue('OCUPANTE_AJENO')
  ocupanteAjeno('OCUPANTE_AJENO'),
  @JsonValue('SIN_OCUPANTES')
  sinOcupantes('SIN_OCUPANTES'),
  @JsonValue('DATOS_INVALIDOS')
  datosInvalidos('DATOS_INVALIDOS'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ResultadoDeVehiculoPropioDtoMotivo(this.json);

  factory ResultadoDeVehiculoPropioDtoMotivo.fromJson(String json) => values.firstWhere(
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
  static List<ResultadoDeVehiculoPropioDtoMotivo> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
