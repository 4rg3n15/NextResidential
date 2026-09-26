// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'veto_listado_dto.g.dart';

@JsonSerializable()
class VetoListadoDto {
  const VetoListadoDto({
    required this.id,
    required this.placa,
    required this.personaId,
    required this.persona,
    required this.documento,
    required this.motivo,
    required this.creadoEn,
  });
  
  factory VetoListadoDto.fromJson(Map<String, Object?> json) => _$VetoListadoDtoFromJson(json);
  
  final String id;
  final String? placa;
  final String? personaId;
  final String? persona;
  final String? documento;
  final String motivo;
  final DateTime creadoEn;

  Map<String, Object?> toJson() => _$VetoListadoDtoToJson(this);
}
