// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'id_creado_dto.g.dart';

@JsonSerializable()
class IdCreadoDto {
  const IdCreadoDto({
    required this.id,
  });
  
  factory IdCreadoDto.fromJson(Map<String, Object?> json) => _$IdCreadoDtoFromJson(json);
  
  final String id;

  Map<String, Object?> toJson() => _$IdCreadoDtoToJson(this);
}
