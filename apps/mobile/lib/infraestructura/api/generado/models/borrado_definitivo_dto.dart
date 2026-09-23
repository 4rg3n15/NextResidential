// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'borrado_definitivo_dto.g.dart';

@JsonSerializable()
class BorradoDefinitivoDto {
  const BorradoDefinitivoDto({
    required this.borrada,
    required this.identificador,
  });
  
  factory BorradoDefinitivoDto.fromJson(Map<String, Object?> json) => _$BorradoDefinitivoDtoFromJson(json);
  
  final bool borrada;
  final String identificador;

  Map<String, Object?> toJson() => _$BorradoDefinitivoDtoToJson(this);
}
