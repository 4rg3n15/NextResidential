// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// 15-Z2 (DT-15W-02) · «propio» lo registró el hogar y se edita y elimina desde la app; «administracion» sólo se ve.
@JsonEnum()
enum MiVehiculoDtoOrigen {
  @JsonValue('propio')
  propio('propio'),
  @JsonValue('administracion')
  administracion('administracion'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const MiVehiculoDtoOrigen(this.json);

  factory MiVehiculoDtoOrigen.fromJson(String json) => values.firstWhere(
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
  static List<MiVehiculoDtoOrigen> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
