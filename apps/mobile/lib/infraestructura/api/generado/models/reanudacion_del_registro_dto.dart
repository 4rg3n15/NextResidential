// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reanudacion_del_registro_dto.g.dart';

@JsonSerializable()
class ReanudacionDelRegistroDto {
  const ReanudacionDelRegistroDto({
    required this.motivo,
  });
  
  factory ReanudacionDelRegistroDto.fromJson(Map<String, Object?> json) => _$ReanudacionDelRegistroDtoFromJson(json);
  
  final String motivo;

  Map<String, Object?> toJson() => _$ReanudacionDelRegistroDtoToJson(this);
}
