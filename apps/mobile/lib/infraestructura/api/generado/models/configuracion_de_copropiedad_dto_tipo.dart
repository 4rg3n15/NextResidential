// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// null = SIN CONFIGURAR, y es lo que dispara el diálogo inicial de la consola. Decide el formulario de alta y las etiquetas sugeridas; ninguna vivienda lo guarda, así que cambiarlo no afecta a las ya creadas.
@JsonEnum()
enum ConfiguracionDeCopropiedadDtoTipo {
  @JsonValue('apartamentos')
  apartamentos('apartamentos'),
  @JsonValue('casas')
  casas('casas'),
  @JsonValue('fincas')
  fincas('fincas'),
  @JsonValue('otro')
  otro('otro'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ConfiguracionDeCopropiedadDtoTipo(this.json);

  factory ConfiguracionDeCopropiedadDtoTipo.fromJson(String json) => values.firstWhere(
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
  static List<ConfiguracionDeCopropiedadDtoTipo> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
