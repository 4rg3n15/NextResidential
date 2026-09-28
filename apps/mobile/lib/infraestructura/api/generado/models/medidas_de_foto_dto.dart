// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'medidas_de_foto_dto.g.dart';

@JsonSerializable()
class MedidasDeFotoDto {
  const MedidasDeFotoDto({
    required this.rostrosDetectados,
    required this.nitidez,
    required this.iluminacion,
    required this.proporcionRostro,
  });
  
  factory MedidasDeFotoDto.fromJson(Map<String, Object?> json) => _$MedidasDeFotoDtoFromJson(json);
  
  final num rostrosDetectados;
  final num nitidez;
  final num iluminacion;
  final num proporcionRostro;

  Map<String, Object?> toJson() => _$MedidasDeFotoDtoToJson(this);
}
