// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'documento_crudo_del_equipo_dto.g.dart';

@JsonSerializable()
class DocumentoCrudoDelEquipoDto {
  const DocumentoCrudoDelEquipoDto({
    required this.titulo,
    required this.contenido,
  });
  
  factory DocumentoCrudoDelEquipoDto.fromJson(Map<String, Object?> json) => _$DocumentoCrudoDelEquipoDtoFromJson(json);
  
  final String titulo;
  final String contenido;

  Map<String, Object?> toJson() => _$DocumentoCrudoDelEquipoDtoToJson(this);
}
