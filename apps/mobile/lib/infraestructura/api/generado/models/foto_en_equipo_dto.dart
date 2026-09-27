// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'foto_en_equipo_dto_estado.dart';

part 'foto_en_equipo_dto.g.dart';

@JsonSerializable()
class FotoEnEquipoDto {
  const FotoEnEquipoDto({
    required this.dispositivoId,
    required this.equipo,
    required this.estado,
    required this.detalle,
    required this.intentos,
    required this.actualizadoEn,
  });
  
  factory FotoEnEquipoDto.fromJson(Map<String, Object?> json) => _$FotoEnEquipoDtoFromJson(json);
  
  final String dispositivoId;
  final String equipo;
  final FotoEnEquipoDtoEstado estado;
  final String? detalle;
  final num intentos;
  final DateTime actualizadoEn;

  Map<String, Object?> toJson() => _$FotoEnEquipoDtoToJson(this);
}
