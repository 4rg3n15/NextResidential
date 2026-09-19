// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'conteos_de_visitantes_dto.g.dart';

@JsonSerializable()
class ConteosDeVisitantesDto {
  const ConteosDeVisitantesDto({
    required this.autorizacionesDelDia,
    required this.dentroAhora,
  });
  
  factory ConteosDeVisitantesDto.fromJson(Map<String, Object?> json) => _$ConteosDeVisitantesDtoFromJson(json);
  
  /// Autorizaciones activas que se cruzan con el día local
  final num autorizacionesDelDia;

  /// Ingresos menos salidas del día. Aproximación declarada: una salida puede no registrarse por fallo de sensor (CU-05, excepción 6a). Nunca es negativo.
  final num dentroAhora;

  Map<String, Object?> toJson() => _$ConteosDeVisitantesDtoToJson(this);
}
