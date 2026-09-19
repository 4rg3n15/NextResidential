// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ingesta_dto.g.dart';

@JsonSerializable()
class IngestaDto {
  const IngestaDto({
    required this.copropiedadId,
  });
  
  factory IngestaDto.fromJson(Map<String, Object?> json) => _$IngestaDtoFromJson(json);
  
  final String copropiedadId;

  Map<String, Object?> toJson() => _$IngestaDtoToJson(this);
}
