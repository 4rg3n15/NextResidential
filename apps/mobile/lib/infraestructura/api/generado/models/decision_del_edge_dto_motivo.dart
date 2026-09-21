// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Obligatorio cuando `permitido` es falso (CA-16)
@JsonEnum()
enum DecisionDelEdgeDtoMotivo {
  @JsonValue('VIGENCIA_EXPIRADA')
  vigenciaExpirada('VIGENCIA_EXPIRADA'),
  @JsonValue('AFORO_SUPERADO')
  aforoSuperado('AFORO_SUPERADO'),
  @JsonValue('LISTA_NEGRA')
  listaNegra('LISTA_NEGRA'),
  @JsonValue('ZONA_NO_AUTORIZADA')
  zonaNoAutorizada('ZONA_NO_AUTORIZADA'),
  @JsonValue('FUERA_DE_PATRON')
  fueraDePatron('FUERA_DE_PATRON'),
  @JsonValue('FUERA_DE_HORARIO')
  fueraDeHorario('FUERA_DE_HORARIO'),
  @JsonValue('SIN_CONSENTIMIENTO')
  sinConsentimiento('SIN_CONSENTIMIENTO'),
  @JsonValue('PLACA_DESCONOCIDA')
  placaDesconocida('PLACA_DESCONOCIDA'),
  @JsonValue('CONFIANZA_INSUFICIENTE')
  confianzaInsuficiente('CONFIANZA_INSUFICIENTE'),
  @JsonValue('FALLO_TECNICO')
  falloTecnico('FALLO_TECNICO'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const DecisionDelEdgeDtoMotivo(this.json);

  factory DecisionDelEdgeDtoMotivo.fromJson(String json) => values.firstWhere(
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
  static List<DecisionDelEdgeDtoMotivo> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
