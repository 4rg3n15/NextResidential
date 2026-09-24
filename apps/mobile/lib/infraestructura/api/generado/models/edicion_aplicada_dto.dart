// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'edicion_aplicada_dto.g.dart';

@JsonSerializable()
class EdicionAplicadaDto {
  const EdicionAplicadaDto({
    required this.editado,
  });
  
  factory EdicionAplicadaDto.fromJson(Map<String, Object?> json) => _$EdicionAplicadaDtoFromJson(json);
  
  final bool editado;

  Map<String, Object?> toJson() => _$EdicionAplicadaDtoToJson(this);
}
