// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'vivienda_dto_estado.dart';

part 'vivienda_dto.g.dart';

@JsonSerializable()
class ViviendaDto {
  const ViviendaDto({
    required this.id,
    required this.identificador,
    required this.agrupacion,
    required this.estado,
    required this.estadoAdministrativo,
    required this.residentes,
    required this.vehiculos,
    required this.autorizacionesVigentes,
    required this.desactivadaEn,
    required this.motivoDesactivacion,
  });
  
  factory ViviendaDto.fromJson(Map<String, Object?> json) => _$ViviendaDtoFromJson(json);
  
  final String id;
  final String identificador;
  final String? agrupacion;
  final ViviendaDtoEstado estado;
  final String estadoAdministrativo;
  final num residentes;
  final num vehiculos;

  /// Autorizaciones vigentes que la vivienda conserva. RN-13: una vivienda inactiva no genera autorizaciones nuevas pero conserva las vigentes.
  final num autorizacionesVigentes;
  final String? desactivadaEn;
  final String? motivoDesactivacion;

  Map<String, Object?> toJson() => _$ViviendaDtoToJson(this);
}
