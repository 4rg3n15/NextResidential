// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'estado_de_consentimiento_dto_estado.dart';

part 'estado_de_consentimiento_dto.g.dart';

@JsonSerializable()
class EstadoDeConsentimientoDto {
  const EstadoDeConsentimientoDto({
    required this.estado,
  });
  
  factory EstadoDeConsentimientoDto.fromJson(Map<String, Object?> json) => _$EstadoDeConsentimientoDtoFromJson(json);
  
  final EstadoDeConsentimientoDtoEstado estado;

  Map<String, Object?> toJson() => _$EstadoDeConsentimientoDtoToJson(this);
}
