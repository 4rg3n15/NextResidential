// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'baja_de_menor_dto.g.dart';

@JsonSerializable()
class BajaDeMenorDto {
  const BajaDeMenorDto({
    required this.motivo,
  });
  
  factory BajaDeMenorDto.fromJson(Map<String, Object?> json) => _$BajaDeMenorDtoFromJson(json);
  
  final String motivo;

  Map<String, Object?> toJson() => _$BajaDeMenorDtoToJson(this);
}
