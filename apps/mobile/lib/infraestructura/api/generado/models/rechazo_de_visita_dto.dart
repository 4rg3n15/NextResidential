// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'rechazo_de_visita_dto.g.dart';

@JsonSerializable()
class RechazoDeVisitaDto {
  const RechazoDeVisitaDto({
    required this.motivo,
  });
  
  factory RechazoDeVisitaDto.fromJson(Map<String, Object?> json) => _$RechazoDeVisitaDtoFromJson(json);
  
  final String motivo;

  Map<String, Object?> toJson() => _$RechazoDeVisitaDtoToJson(this);
}
