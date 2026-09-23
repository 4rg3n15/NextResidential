// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hallazgo_del_equipo_dto.dart';

part 'ficha_del_equipo_dto.g.dart';

@JsonSerializable()
class FichaDelEquipoDto {
  const FichaDelEquipoDto({
    required this.modelo,
    required this.firmware,
    required this.serie,
    required this.horaDelEquipo,
    required this.desvioDeRelojSegundos,
    required this.hallazgos,
    required this.sinComprobar,
  });
  
  factory FichaDelEquipoDto.fromJson(Map<String, Object?> json) => _$FichaDelEquipoDtoFromJson(json);
  
  final String? modelo;
  final String? firmware;
  final String? serie;
  final String? horaDelEquipo;
  final num? desvioDeRelojSegundos;
  final List<HallazgoDelEquipoDto> hallazgos;
  final List<String> sinComprobar;

  Map<String, Object?> toJson() => _$FichaDelEquipoDtoToJson(this);
}
