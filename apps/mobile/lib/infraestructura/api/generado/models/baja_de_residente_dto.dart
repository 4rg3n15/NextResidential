// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'baja_de_residente_dto.g.dart';

@JsonSerializable()
class BajaDeResidenteDto {
  const BajaDeResidenteDto({
    required this.motivo,
  });
  
  factory BajaDeResidenteDto.fromJson(Map<String, Object?> json) => _$BajaDeResidenteDtoFromJson(json);
  
  final String motivo;

  Map<String, Object?> toJson() => _$BajaDeResidenteDtoToJson(this);
}
