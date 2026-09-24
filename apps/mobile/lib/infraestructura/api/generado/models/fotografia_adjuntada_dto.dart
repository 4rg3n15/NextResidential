// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'fotografia_adjuntada_dto.g.dart';

@JsonSerializable()
class FotografiaAdjuntadaDto {
  const FotografiaAdjuntadaDto({
    required this.adjuntada,
    required this.tipoMime,
    required this.tamanoBytes,
  });
  
  factory FotografiaAdjuntadaDto.fromJson(Map<String, Object?> json) => _$FotografiaAdjuntadaDtoFromJson(json);
  
  final bool adjuntada;
  final String tipoMime;
  final num tamanoBytes;

  Map<String, Object?> toJson() => _$FotografiaAdjuntadaDtoToJson(this);
}
