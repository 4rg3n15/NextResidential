// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'verificacion_remota_dto.g.dart';

@JsonSerializable()
class VerificacionRemotaDto {
  const VerificacionRemotaDto({
    required this.motivo,
    required this.activar,
  });
  
  factory VerificacionRemotaDto.fromJson(Map<String, Object?> json) => _$VerificacionRemotaDtoFromJson(json);
  
  /// Por qué se cambia. Queda en la auditoría junto a quién y cuándo.
  final String motivo;

  /// `true` = la terminal reporta y espera el veredicto; `false` = decide sola (plan B)
  final bool activar;

  Map<String, Object?> toJson() => _$VerificacionRemotaDtoToJson(this);
}
