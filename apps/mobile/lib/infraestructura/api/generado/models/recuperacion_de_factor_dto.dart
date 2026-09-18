// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'recuperacion_de_factor_dto.g.dart';

@JsonSerializable()
class RecuperacionDeFactorDto {
  const RecuperacionDeFactorDto({
    required this.factoresRetirados,
    required this.codigosRestantes,
  });
  
  factory RecuperacionDeFactorDto.fromJson(Map<String, Object?> json) => _$RecuperacionDeFactorDtoFromJson(json);
  
  /// Factores TOTP verificados que se retiraron. Ya se puede inscribir uno nuevo.
  final num factoresRetirados;

  /// Códigos de recuperación que quedan sin usar
  final num codigosRestantes;

  Map<String, Object?> toJson() => _$RecuperacionDeFactorDtoToJson(this);
}
