// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'desbloqueo_dto.g.dart';

@JsonSerializable()
class DesbloqueoDto {
  const DesbloqueoDto({
    required this.codigo,
  });
  
  factory DesbloqueoDto.fromJson(Map<String, Object?> json) => _$DesbloqueoDtoFromJson(json);
  
  /// El código que la consola mostraba
  final String codigo;

  Map<String, Object?> toJson() => _$DesbloqueoDtoToJson(this);
}
