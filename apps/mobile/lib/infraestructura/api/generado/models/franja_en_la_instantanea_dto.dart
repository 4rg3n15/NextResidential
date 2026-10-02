// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'franja_en_la_instantanea_dto.g.dart';

@JsonSerializable()
class FranjaEnLaInstantaneaDto {
  const FranjaEnLaInstantaneaDto({
    required this.dia,
    required this.minutoInicio,
    required this.minutoFin,
    required this.continuaDelDiaAnterior,
  });
  
  factory FranjaEnLaInstantaneaDto.fromJson(Map<String, Object?> json) => _$FranjaEnLaInstantaneaDtoFromJson(json);
  
  final num dia;
  final num minutoInicio;
  final num minutoFin;
  final bool continuaDelDiaAnterior;

  Map<String, Object?> toJson() => _$FranjaEnLaInstantaneaDtoToJson(this);
}
