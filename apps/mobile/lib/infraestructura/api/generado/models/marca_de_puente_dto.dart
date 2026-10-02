// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'marca_de_puente_dto.g.dart';

@JsonSerializable()
class MarcaDePuenteDto {
  const MarcaDePuenteDto({
    required this.puente,
  });
  
  factory MarcaDePuenteDto.fromJson(Map<String, Object?> json) => _$MarcaDePuenteDtoFromJson(json);
  
  /// true: los equipos pasan a operarse por este Edge
  final bool puente;

  Map<String, Object?> toJson() => _$MarcaDePuenteDtoToJson(this);
}
