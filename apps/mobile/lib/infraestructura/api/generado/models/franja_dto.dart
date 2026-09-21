// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'franja_dto.g.dart';

@JsonSerializable()
class FranjaDto {
  const FranjaDto({
    required this.dia,
    required this.minutoInicio,
    required this.minutoFin,
    this.continuaDelDiaAnterior,
  });
  
  factory FranjaDto.fromJson(Map<String, Object?> json) => _$FranjaDtoFromJson(json);
  
  /// 0 = domingo … 6 = sábado
  final num dia;
  final num minutoInicio;
  final num minutoFin;

  /// Continúa la franja del día anterior tras la medianoche
  final bool? continuaDelDiaAnterior;

  Map<String, Object?> toJson() => _$FranjaDtoToJson(this);
}
