// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'modificacion_dto.g.dart';

@JsonSerializable()
class ModificacionDto {
  const ModificacionDto({
    required this.modificada,
  });
  
  factory ModificacionDto.fromJson(Map<String, Object?> json) => _$ModificacionDtoFromJson(json);
  
  final bool modificada;

  Map<String, Object?> toJson() => _$ModificacionDtoToJson(this);
}
