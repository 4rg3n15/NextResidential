// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'registro_reanudado_dto.g.dart';

@JsonSerializable()
class RegistroReanudadoDto {
  const RegistroReanudadoDto({
    required this.reanudado,
  });
  
  factory RegistroReanudadoDto.fromJson(Map<String, Object?> json) => _$RegistroReanudadoDtoFromJson(json);
  
  /// Siempre true
  final bool reanudado;

  Map<String, Object?> toJson() => _$RegistroReanudadoDtoToJson(this);
}
