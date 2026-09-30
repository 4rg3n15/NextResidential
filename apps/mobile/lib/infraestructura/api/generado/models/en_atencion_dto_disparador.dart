// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// G1 (15-N) · por qué necesita a una persona (P-22).
@JsonEnum()
enum EnAtencionDtoDisparador {
  @JsonValue('llamada')
  llamada('llamada'),
  @JsonValue('rostro')
  rostro('rostro'),
  @JsonValue('placa')
  placa('placa'),
  @JsonValue('lista_negra')
  listaNegra('lista_negra'),
  @JsonValue('dudoso')
  dudoso('dudoso'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const EnAtencionDtoDisparador(this.json);

  factory EnAtencionDtoDisparador.fromJson(String json) => values.firstWhere(
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
  static List<EnAtencionDtoDisparador> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
