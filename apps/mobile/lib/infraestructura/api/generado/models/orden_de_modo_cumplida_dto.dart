// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'orden_de_modo_cumplida_dto_resultado.dart';

part 'orden_de_modo_cumplida_dto.g.dart';

@JsonSerializable()
class OrdenDeModoCumplidaDto {
  const OrdenDeModoCumplidaDto({
    required this.id,
    required this.resultado,
    required this.detalle,
    required this.revierteEn,
  });
  
  factory OrdenDeModoCumplidaDto.fromJson(Map<String, Object?> json) => _$OrdenDeModoCumplidaDtoFromJson(json);
  
  final String id;
  final OrdenDeModoCumplidaDtoResultado resultado;
  final String? detalle;
  final DateTime? revierteEn;

  Map<String, Object?> toJson() => _$OrdenDeModoCumplidaDtoToJson(this);
}
