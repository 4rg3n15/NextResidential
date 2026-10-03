// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ajustes_de_puertas_dto.g.dart';

@JsonSerializable()
class AjustesDePuertasDto {
  const AjustesDePuertasDto({
    required this.duracionMaximaMinutos,
  });
  
  factory AjustesDePuertasDto.fromJson(Map<String, Object?> json) => _$AjustesDePuertasDtoFromJson(json);
  
  final num duracionMaximaMinutos;

  Map<String, Object?> toJson() => _$AjustesDePuertasDtoToJson(this);
}
