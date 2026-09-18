// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'codigos_de_recuperacion_dto.g.dart';

@JsonSerializable()
class CodigosDeRecuperacionDto {
  const CodigosDeRecuperacionDto({
    required this.codigos,
    required this.cantidad,
  });
  
  factory CodigosDeRecuperacionDto.fromJson(Map<String, Object?> json) => _$CodigosDeRecuperacionDtoFromJson(json);
  
  /// Códigos de un solo uso, en claro. Se entregan UNA vez: solo se guarda su hash. No dan acceso — autorizan a retirar el factor perdido para inscribir otro.
  final List<String> codigos;
  final num cantidad;

  Map<String, Object?> toJson() => _$CodigosDeRecuperacionDtoToJson(this);
}
