// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'restablecimiento_registrado_dto.g.dart';

@JsonSerializable()
class RestablecimientoRegistradoDto {
  const RestablecimientoRegistradoDto({
    required this.registrado,
  });
  
  factory RestablecimientoRegistradoDto.fromJson(Map<String, Object?> json) => _$RestablecimientoRegistradoDtoFromJson(json);
  
  /// Siempre true; la respuesta es 204 sin cuerpo
  final bool registrado;

  Map<String, Object?> toJson() => _$RestablecimientoRegistradoDtoToJson(this);
}
