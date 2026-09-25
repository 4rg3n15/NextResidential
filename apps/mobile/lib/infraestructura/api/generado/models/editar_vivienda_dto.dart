// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'editar_vivienda_dto_estado_administrativo.dart';

part 'editar_vivienda_dto.g.dart';

@JsonSerializable()
class EditarViviendaDto {
  const EditarViviendaDto({
    this.identificador,
    this.agrupacion,
    this.estadoAdministrativo,
  });
  
  factory EditarViviendaDto.fromJson(Map<String, Object?> json) => _$EditarViviendaDtoFromJson(json);
  
  final String? identificador;
  final String? agrupacion;
  final EditarViviendaDtoEstadoAdministrativo? estadoAdministrativo;

  Map<String, Object?> toJson() => _$EditarViviendaDtoToJson(this);
}
