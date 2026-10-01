// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// 15-P · por dónde viaja el audio entre la consola y la API (GUARDIA_AUDIO_TRANSPORTE). «websocket»: billete de un solo uso y un canal ordenado (ADR-01, enmienda 15-P); «http»: un GET de bajada y un POST por trozo.
@JsonEnum()
enum EstadoDeCanalDtoVia {
  @JsonValue('websocket')
  websocket('websocket'),
  @JsonValue('http')
  http('http'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const EstadoDeCanalDtoVia(this.json);

  factory EstadoDeCanalDtoVia.fromJson(String json) => values.firstWhere(
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
  static List<EstadoDeCanalDtoVia> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
