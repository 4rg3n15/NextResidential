// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'totales_de_viviendas_dto.g.dart';

@JsonSerializable()
class TotalesDeViviendasDto {
  const TotalesDeViviendasDto({
    required this.activas,
    required this.inactivas,
  });
  
  factory TotalesDeViviendasDto.fromJson(Map<String, Object?> json) => _$TotalesDeViviendasDtoFromJson(json);
  
  final num activas;
  final num inactivas;

  Map<String, Object?> toJson() => _$TotalesDeViviendasDtoToJson(this);
}
