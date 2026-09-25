// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'estado_de_sesion_dto_estado.dart';

part 'estado_de_sesion_dto.g.dart';

@JsonSerializable()
class EstadoDeSesionDto {
  const EstadoDeSesionDto({
    required this.estado,
    required this.codigo,
    required this.turnoInicio,
    required this.turnoFin,
    required this.porteria,
    required this.intentosRestantes,
    required this.patrullajeDesde,
    required this.motivoCierre,
  });
  
  factory EstadoDeSesionDto.fromJson(Map<String, Object?> json) => _$EstadoDeSesionDtoFromJson(json);
  
  final EstadoDeSesionDtoEstado estado;

  /// Sólo con la sesión activa
  final String? codigo;
  final DateTime? turnoInicio;
  final DateTime? turnoFin;
  final String? porteria;
  final num? intentosRestantes;
  final DateTime? patrullajeDesde;
  final String? motivoCierre;

  Map<String, Object?> toJson() => _$EstadoDeSesionDtoToJson(this);
}
