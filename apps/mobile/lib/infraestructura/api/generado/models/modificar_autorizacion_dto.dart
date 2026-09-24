// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'modificar_autorizacion_dto.g.dart';

@JsonSerializable()
class ModificarAutorizacionDto {
  const ModificarAutorizacionDto({
    this.hasta,
    this.placa,
    this.observaciones,
  });
  
  factory ModificarAutorizacionDto.fromJson(Map<String, Object?> json) => _$ModificarAutorizacionDtoFromJson(json);
  
  final DateTime? hasta;
  final String? placa;
  final String? observaciones;

  Map<String, Object?> toJson() => _$ModificarAutorizacionDtoToJson(this);
}
