// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'medidas_de_captura_dto.dart';

part 'rostro_de_mi_visitante_dto.g.dart';

@JsonSerializable()
class RostroDeMiVisitanteDto {
  const RostroDeMiVisitanteDto({
    required this.vector,
    required this.medidas,
    required this.versionPolitica,
    required this.suprimirEn,
  });
  
  factory RostroDeMiVisitanteDto.fromJson(Map<String, Object?> json) => _$RostroDeMiVisitanteDtoFromJson(json);
  
  /// Plantilla derivada, en base64. Entra cifrada a la bóveda y no vuelve a salir.
  final String vector;
  final MedidasDeCapturaDto medidas;

  /// Versión de la política de tratamiento que se le mostró
  final String versionPolitica;

  /// Cuándo se suprime la plantilla. RN-11: no más allá de la visita.
  final DateTime suprimirEn;

  Map<String, Object?> toJson() => _$RostroDeMiVisitanteDtoToJson(this);
}
