// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'equipo_omitido_dto.g.dart';

@JsonSerializable()
class EquipoOmitidoDto {
  const EquipoOmitidoDto({
    required this.dispositivoId,
    required this.nombre,
    required this.detalle,
  });
  
  factory EquipoOmitidoDto.fromJson(Map<String, Object?> json) => _$EquipoOmitidoDtoFromJson(json);
  
  final String dispositivoId;
  final String nombre;

  /// Por qué no recibió la plantilla, en palabras
  final String detalle;

  Map<String, Object?> toJson() => _$EquipoOmitidoDtoToJson(this);
}
