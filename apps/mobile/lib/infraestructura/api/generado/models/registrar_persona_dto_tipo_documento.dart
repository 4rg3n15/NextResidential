// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Catálogo del enumerado `tipo_documento` de la migración 0002.
@JsonEnum()
enum RegistrarPersonaDtoTipoDocumento {
  @JsonValue('cedula')
  cedula('cedula'),
  @JsonValue('cedula_extranjeria')
  cedulaExtranjeria('cedula_extranjeria'),
  @JsonValue('pasaporte')
  pasaporte('pasaporte'),
  @JsonValue('nit')
  nit('nit'),
  @JsonValue('otro')
  otro('otro'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const RegistrarPersonaDtoTipoDocumento(this.json);

  factory RegistrarPersonaDtoTipoDocumento.fromJson(String json) => values.firstWhere(
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
  static List<RegistrarPersonaDtoTipoDocumento> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
