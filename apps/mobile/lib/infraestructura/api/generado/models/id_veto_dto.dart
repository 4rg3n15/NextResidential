// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'id_veto_dto.g.dart';

@JsonSerializable()
class IdVetoDto {
  const IdVetoDto({
    required this.id,
  });
  
  factory IdVetoDto.fromJson(Map<String, Object?> json) => _$IdVetoDtoFromJson(json);
  
  final String id;

  Map<String, Object?> toJson() => _$IdVetoDtoToJson(this);
}
