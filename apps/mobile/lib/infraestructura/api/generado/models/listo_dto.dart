// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'listo_dto.g.dart';

@JsonSerializable()
class ListoDto {
  const ListoDto({
    required this.estado,
    required this.dependencias,
  });
  
  factory ListoDto.fromJson(Map<String, Object?> json) => _$ListoDtoFromJson(json);
  
  final String estado;

  /// Estado por dependencia. Un 503 devuelve esta misma forma con el detalle.
  final Map<String, String> dependencias;

  Map<String, Object?> toJson() => _$ListoDtoToJson(this);
}
