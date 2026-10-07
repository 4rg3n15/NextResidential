// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'tope_de_plazas_dto.g.dart';

@JsonSerializable()
class TopeDePlazasDto {
  const TopeDePlazasDto({
    required this.tope,
    required this.activas,
    required this.propio,
  });
  
  factory TopeDePlazasDto.fromJson(Map<String, Object?> json) => _$TopeDePlazasDtoFromJson(json);
  
  final num tope;

  /// Plazas vivas, la del titular incluida
  final num activas;

  /// El tope es de esta vivienda, no el de su copropiedad
  final bool propio;

  Map<String, Object?> toJson() => _$TopeDePlazasDtoToJson(this);
}
