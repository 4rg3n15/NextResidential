// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Acepta la política: sin ella no hay rostro
@JsonEnum()
enum MiRostroDtoAceptaPolitica {
  /// The name has been replaced because it contains a keyword. Original name: `true`.
  @JsonValue('true')
  valueTrue('true'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const MiRostroDtoAceptaPolitica(this.json);

  factory MiRostroDtoAceptaPolitica.fromJson(bool json) => values.firstWhere(
        (e) => e.json == json,
        orElse: () => $unknown,
      );

  final bool? json;
  bool toJson() {
    final value = json;
    if (value == null) {
      throw StateError('Cannot convert enum value with null JSON representation to bool. '
          'This usually happens for \$unknown or @JsonValue(null) entries.');
    }
    return value as bool;
  }

  @override
  String toString() => json?.toString() ?? super.toString();
  /// Returns all defined enum values excluding the $unknown value.
  static List<MiRostroDtoAceptaPolitica> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
