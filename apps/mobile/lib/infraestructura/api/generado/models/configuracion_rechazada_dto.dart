// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'rechazo_de_ajuste_dto.dart';

part 'configuracion_rechazada_dto.g.dart';

@JsonSerializable()
class ConfiguracionRechazadaDto {
  const ConfiguracionRechazadaDto({
    required this.codigo,
    required this.rechazos,
  });
  
  factory ConfiguracionRechazadaDto.fromJson(Map<String, Object?> json) => _$ConfiguracionRechazadaDtoFromJson(json);
  
  final num codigo;

  /// TODOS los rechazos, no el primero: quien corrige un formulario necesita ver los cinco errores de una vez, no descubrirlos de uno en uno.
  final List<RechazoDeAjusteDto> rechazos;

  Map<String, Object?> toJson() => _$ConfiguracionRechazadaDtoToJson(this);
}
