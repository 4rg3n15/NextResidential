// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'orden_manual_dto_accion.dart';

part 'orden_manual_dto.g.dart';

@JsonSerializable()
class OrdenManualDto {
  const OrdenManualDto({
    required this.dispositivoId,
    required this.accion,
    required this.motivo,
    this.eventoId,
  });
  
  factory OrdenManualDto.fromJson(Map<String, Object?> json) => _$OrdenManualDtoFromJson(json);
  
  final String dispositivoId;
  final OrdenManualDtoAccion accion;

  /// Obligatorio. Sin motivo la puerta NO se acciona: no es un campo requerido del formulario, es una condición de la orden (RN-08, CA-16, CA-17).
  final String motivo;

  /// Evento que se está atendiendo
  final String? eventoId;

  Map<String, Object?> toJson() => _$OrdenManualDtoToJson(this);
}
