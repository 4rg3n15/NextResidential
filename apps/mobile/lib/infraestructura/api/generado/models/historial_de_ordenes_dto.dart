// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'orden_ejecutada_dto.dart';

part 'historial_de_ordenes_dto.g.dart';

@JsonSerializable()
class HistorialDeOrdenesDto {
  const HistorialDeOrdenesDto({
    required this.ordenes,
  });
  
  factory HistorialDeOrdenesDto.fromJson(Map<String, Object?> json) => _$HistorialDeOrdenesDtoFromJson(json);
  
  final List<OrdenEjecutadaDto> ordenes;

  Map<String, Object?> toJson() => _$HistorialDeOrdenesDtoToJson(this);
}
