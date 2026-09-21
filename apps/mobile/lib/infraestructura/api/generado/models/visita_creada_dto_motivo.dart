// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Motivo TIPADO del rechazo (RN-06, RN-13, P-11, RN-04/CA-03)
@JsonEnum()
enum VisitaCreadaDtoMotivo {
  @JsonValue('LISTA_NEGRA')
  listaNegra('LISTA_NEGRA'),
  @JsonValue('VIVIENDA_INACTIVA')
  viviendaInactiva('VIVIENDA_INACTIVA'),
  @JsonValue('SIN_NIVEL_DE_ACCESO')
  sinNivelDeAcceso('SIN_NIVEL_DE_ACCESO'),
  @JsonValue('PLACA_DUPLICADA')
  placaDuplicada('PLACA_DUPLICADA'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const VisitaCreadaDtoMotivo(this.json);

  factory VisitaCreadaDtoMotivo.fromJson(String json) => values.firstWhere(
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
  static List<VisitaCreadaDtoMotivo> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
