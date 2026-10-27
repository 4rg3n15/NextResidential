// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'parte_del_respaldo_dto.g.dart';

@JsonSerializable()
class ParteDelRespaldoDto {
  const ParteDelRespaldoDto({
    required this.generados,
    required this.fallidosAlGenerar,
    required this.enviados,
    required this.fallidosAlEnviar,
    required this.sinConfigurar,
  });
  
  factory ParteDelRespaldoDto.fromJson(Map<String, Object?> json) => _$ParteDelRespaldoDtoFromJson(json);
  
  final num generados;
  final num fallidosAlGenerar;
  final num enviados;
  final num fallidosAlEnviar;
  final num sinConfigurar;

  Map<String, Object?> toJson() => _$ParteDelRespaldoDtoToJson(this);
}
