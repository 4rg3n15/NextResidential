// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'canal_de_video_dto.g.dart';

@JsonSerializable()
class CanalDeVideoDto {
  const CanalDeVideoDto({
    required this.id,
    required this.codec,
  });
  
  factory CanalDeVideoDto.fromJson(Map<String, Object?> json) => _$CanalDeVideoDtoFromJson(json);
  
  /// canal×100+flujo, p. ej. 102
  final String id;

  /// «H.264», «H.265»…
  final String? codec;

  Map<String, Object?> toJson() => _$CanalDeVideoDtoToJson(this);
}
