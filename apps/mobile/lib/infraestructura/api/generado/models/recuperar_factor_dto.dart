// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'recuperar_factor_dto.g.dart';

@JsonSerializable()
class RecuperarFactorDto {
  const RecuperarFactorDto({
    required this.codigo,
  });
  
  factory RecuperarFactorDto.fromJson(Map<String, Object?> json) => _$RecuperarFactorDtoFromJson(json);
  
  /// Código de recuperación con la forma XXXXX-XXXXX
  final String codigo;

  Map<String, Object?> toJson() => _$RecuperarFactorDtoToJson(this);
}
