// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'elemento_de_linea_de_tiempo_dto.dart';

part 'linea_de_tiempo_dto.g.dart';

@JsonSerializable()
class LineaDeTiempoDto {
  const LineaDeTiempoDto({
    required this.elementos,
  });
  
  factory LineaDeTiempoDto.fromJson(Map<String, Object?> json) => _$LineaDeTiempoDtoFromJson(json);
  
  final List<ElementoDeLineaDeTiempoDto> elementos;

  Map<String, Object?> toJson() => _$LineaDeTiempoDtoToJson(this);
}
