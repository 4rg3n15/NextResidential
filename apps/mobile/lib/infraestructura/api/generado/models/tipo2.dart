// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum Tipo2 {
  @JsonValue('accesos_por_periodo')
  accesosPorPeriodo('accesos_por_periodo'),
  @JsonValue('visitantes_frecuentes')
  visitantesFrecuentes('visitantes_frecuentes'),
  @JsonValue('uso_de_zonas')
  usoDeZonas('uso_de_zonas'),
  @JsonValue('auditoria_de_sistema')
  auditoriaDeSistema('auditoria_de_sistema'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const Tipo2(this.json);

  factory Tipo2.fromJson(String json) => values.firstWhere(
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
  static List<Tipo2> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
