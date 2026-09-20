// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'rostro_capturado_dto.g.dart';

@JsonSerializable()
class RostroCapturadoDto {
  const RostroCapturadoDto({
    required this.aceptada,
    required this.motivos,
    required this.plantillaId,
    required this.consentimientoId,
    required this.titular,
    required this.calidad,
  });
  
  factory RostroCapturadoDto.fromJson(Map<String, Object?> json) => _$RostroCapturadoDtoFromJson(json);
  
  final bool aceptada;

  /// Por qué no sirve la foto. Vacío cuando sí sirve.
  final List<String> motivos;
  final String? plantillaId;

  /// El consentimiento queda PENDIENTE. Nadie responde por el titular (RN-10).
  final String? consentimientoId;

  /// A quién se le pidió: el visitante, no el residente que tomó la foto
  final String? titular;
  final num? calidad;

  Map<String, Object?> toJson() => _$RostroCapturadoDtoToJson(this);
}
