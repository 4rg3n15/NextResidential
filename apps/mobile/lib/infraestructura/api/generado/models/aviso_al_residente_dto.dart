// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'aviso_al_residente_dto.g.dart';

@JsonSerializable()
class AvisoAlResidenteDto {
  const AvisoAlResidenteDto({
    required this.viviendaId,
    required this.texto,
  });
  
  factory AvisoAlResidenteDto.fromJson(Map<String, Object?> json) => _$AvisoAlResidenteDtoFromJson(json);
  
  final String viviendaId;
  final String texto;

  Map<String, Object?> toJson() => _$AvisoAlResidenteDtoToJson(this);
}
