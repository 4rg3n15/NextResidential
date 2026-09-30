// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'preferencia_de_disparador_dto.g.dart';

@JsonSerializable()
class PreferenciaDeDisparadorDto {
  const PreferenciaDeDisparadorDto({
    required this.abrir,
    required this.sonar,
  });
  
  factory PreferenciaDeDisparadorDto.fromJson(Map<String, Object?> json) => _$PreferenciaDeDisparadorDtoFromJson(json);
  
  /// La Atención se abre sola con este disparador.
  final bool abrir;

  /// La consola suena con este disparador.
  final bool sonar;

  Map<String, Object?> toJson() => _$PreferenciaDeDisparadorDtoToJson(this);
}
