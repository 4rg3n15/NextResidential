// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'acompanante_agregado_dto.g.dart';

@JsonSerializable()
class AcompananteAgregadoDto {
  const AcompananteAgregadoDto({
    required this.agregado,
  });
  
  factory AcompananteAgregadoDto.fromJson(Map<String, Object?> json) => _$AcompananteAgregadoDtoFromJson(json);
  
  final bool agregado;

  Map<String, Object?> toJson() => _$AcompananteAgregadoDtoToJson(this);
}
