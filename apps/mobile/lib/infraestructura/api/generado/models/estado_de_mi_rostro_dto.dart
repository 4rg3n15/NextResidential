// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'equipo_del_rostro_dto.dart';
import 'estado_de_mi_rostro_dto_estado.dart';

part 'estado_de_mi_rostro_dto.g.dart';

@JsonSerializable()
class EstadoDeMiRostroDto {
  const EstadoDeMiRostroDto({
    required this.estado,
    required this.calidad,
    required this.registradoEn,
    required this.venceEn,
    required this.diasParaVencer,
    required this.equiposConRostro,
    required this.equiposConMiRostro,
    required this.equipos,
  });
  
  factory EstadoDeMiRostroDto.fromJson(Map<String, Object?> json) => _$EstadoDeMiRostroDtoFromJson(json);
  
  final EstadoDeMiRostroDtoEstado estado;
  final num? calidad;
  final DateTime? registradoEn;
  final DateTime? venceEn;
  final num? diasParaVencer;
  final num equiposConRostro;
  final num equiposConMiRostro;
  final List<EquipoDelRostroDto> equipos;

  Map<String, Object?> toJson() => _$EstadoDeMiRostroDtoToJson(this);
}
