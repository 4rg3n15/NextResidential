// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'notas_de_alerta_dto.g.dart';

@JsonSerializable()
class NotasDeAlertaDto {
  const NotasDeAlertaDto({
    required this.notas,
  });
  
  factory NotasDeAlertaDto.fromJson(Map<String, Object?> json) => _$NotasDeAlertaDtoFromJson(json);
  
  final String notas;

  Map<String, Object?> toJson() => _$NotasDeAlertaDtoToJson(this);
}
