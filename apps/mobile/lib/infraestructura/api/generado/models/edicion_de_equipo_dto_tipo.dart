// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum EdicionDeEquipoDtoTipo {
  @JsonValue('camara_lpr')
  camaraLpr('camara_lpr'),
  @JsonValue('terminal_facial')
  terminalFacial('terminal_facial'),
  @JsonValue('intercom')
  intercom('intercom'),
  @JsonValue('rele')
  rele('rele'),
  @JsonValue('controlador_io')
  controladorIo('controlador_io'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const EdicionDeEquipoDtoTipo(this.json);

  factory EdicionDeEquipoDtoTipo.fromJson(String json) => values.firstWhere(
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
  static List<EdicionDeEquipoDtoTipo> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
