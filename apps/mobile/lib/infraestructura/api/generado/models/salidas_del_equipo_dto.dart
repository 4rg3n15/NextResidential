// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'nodo_de_salidas_dto.dart';
import 'punto_de_acceso_dto.dart';

part 'salidas_del_equipo_dto.g.dart';

@JsonSerializable()
class SalidasDelEquipoDto {
  const SalidasDelEquipoDto({
    required this.arbol,
    required this.motivoSinArbol,
    required this.puntos,
  });
  
  factory SalidasDelEquipoDto.fromJson(Map<String, Object?> json) => _$SalidasDelEquipoDtoFromJson(json);
  
  /// Vacío si no se pudo leer el equipo
  final List<NodoDeSalidasDto> arbol;
  final String? motivoSinArbol;
  final List<PuntoDeAccesoDto> puntos;

  Map<String, Object?> toJson() => _$SalidasDelEquipoDtoToJson(this);
}
