// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'codigo_del_equipo_dto.g.dart';

@JsonSerializable()
class CodigoDelEquipoDto {
  const CodigoDelEquipoDto({
    required this.mayor,
    required this.menor,
  });
  
  factory CodigoDelEquipoDto.fromJson(Map<String, Object?> json) => _$CodigoDelEquipoDtoFromJson(json);
  
  final num mayor;
  final num menor;

  Map<String, Object?> toJson() => _$CodigoDelEquipoDtoToJson(this);
}
