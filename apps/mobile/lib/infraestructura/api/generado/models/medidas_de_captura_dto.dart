// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'medidas_de_captura_dto.g.dart';

@JsonSerializable()
class MedidasDeCapturaDto {
  const MedidasDeCapturaDto({
    required this.nitidez,
    required this.iluminacion,
    required this.rostrosDetectados,
    required this.proporcionRostro,
  });
  
  factory MedidasDeCapturaDto.fromJson(Map<String, Object?> json) => _$MedidasDeCapturaDtoFromJson(json);
  
  final num nitidez;
  final num iluminacion;
  final num rostrosDetectados;
  final num proporcionRostro;

  Map<String, Object?> toJson() => _$MedidasDeCapturaDtoToJson(this);
}
