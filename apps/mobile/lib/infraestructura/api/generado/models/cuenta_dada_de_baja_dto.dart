// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cuenta_dada_de_baja_dto.g.dart';

@JsonSerializable()
class CuentaDadaDeBajaDto {
  const CuentaDadaDeBajaDto({
    required this.dadaDeBaja,
    required this.plantillasSuprimidas,
  });
  
  factory CuentaDadaDeBajaDto.fromJson(Map<String, Object?> json) => _$CuentaDadaDeBajaDtoFromJson(json);
  
  final bool dadaDeBaja;
  final num plantillasSuprimidas;

  Map<String, Object?> toJson() => _$CuentaDadaDeBajaDtoToJson(this);
}
