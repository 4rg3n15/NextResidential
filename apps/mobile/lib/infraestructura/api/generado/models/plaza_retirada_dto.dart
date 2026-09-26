// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'plaza_retirada_dto.g.dart';

@JsonSerializable()
class PlazaRetiradaDto {
  const PlazaRetiradaDto({
    required this.retirada,
  });
  
  factory PlazaRetiradaDto.fromJson(Map<String, Object?> json) => _$PlazaRetiradaDtoFromJson(json);
  
  final bool retirada;

  Map<String, Object?> toJson() => _$PlazaRetiradaDtoToJson(this);
}
