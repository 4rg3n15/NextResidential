// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'codigo_de_traspaso_dto.g.dart';

@JsonSerializable()
class CodigoDeTraspasoDto {
  const CodigoDeTraspasoDto({
    required this.codigo,
  });
  
  factory CodigoDeTraspasoDto.fromJson(Map<String, Object?> json) => _$CodigoDeTraspasoDtoFromJson(json);
  
  /// Un solo uso: para «Crear cuenta»
  final String codigo;

  Map<String, Object?> toJson() => _$CodigoDeTraspasoDtoToJson(this);
}
