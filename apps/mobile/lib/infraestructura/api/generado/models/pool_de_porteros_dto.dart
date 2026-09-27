// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'pool_de_porteros_dto.g.dart';

@JsonSerializable()
class PoolDePorterosDto {
  const PoolDePorterosDto({
    required this.inicio,
    required this.fin,
    required this.siguiente,
    required this.cupo,
    required this.activos,
  });
  
  factory PoolDePorterosDto.fromJson(Map<String, Object?> json) => _$PoolDePorterosDtoFromJson(json);
  
  final num inicio;
  final num fin;

  /// El próximo número que se asignará
  final num siguiente;

  /// Porteros activos que admite (máximo 999)
  final num cupo;

  /// Porteros activos ahora
  final num activos;

  Map<String, Object?> toJson() => _$PoolDePorterosDtoToJson(this);
}
